import {
  displayStatus,
  formatDate,
  randomToken,
  toEatIso,
  type TicketTransferRequest,
  type TicketTransferResult,
} from '@eventify/shared';
import { eq, sql } from 'drizzle-orm';
import type { Db } from './db/client';
import { events, orders, tickets } from './db/schema';
import { ticketEmail } from './email/ticketEmail';
import type { Mailer } from './email/mailer';
import { publishedEvent } from './events';
import { ticketCode } from './orders';
import { ticketView } from './tickets';

export type TransferDeps = {
  db: Db;
  mailer: Mailer;
  signingKey: CryptoKey;
  siteUrl: string;
  now: () => number;
};

export type TransferFailure = { status: 409 | 410 | 422; error: string; message: string };

/** "j•••@gmail.com": enough for whoever passed a ticket on to recognise where it went. */
export const maskEmail = (email: string) => {
  const [name = '', domain = ''] = email.split('@');
  return `${name.slice(0, 1)}•••@${domain}`;
};

/** The 410 for a ticket that was passed on, saying where and when. Undefined if it wasn't. */
export async function transferredAway(db: Db, id: string): Promise<TransferFailure | undefined> {
  const [old] = await db.select().from(tickets).where(eq(tickets.id, id));
  if (!old?.transferredAt) return undefined;
  const [next] = await db
    .select({ email: tickets.holderEmail })
    .from(tickets)
    .where(eq(tickets.transferredFromId, id));
  return {
    status: 410,
    error: 'transferred',
    message: `This ticket was transferred${next?.email ? ` to ${maskEmail(next.email)}` : ''} on ${formatDate(toEatIso(old.transferredAt.getTime()))}, so it no longer works. They have a new ticket of their own.`,
  };
}

/**
 * Pass a ticket on: a new ticket (new link, code and QR) for the recipient, and
 * this one stops working at once, so screenshots and forwarded links from before are useless.
 * Holding the link is the permission, as it is at the door. Undefined when there's no such ticket.
 * The new ticket is emailed after the change is saved; if that fails the recipient still finds it
 * by signing in with their email.
 */
export async function transferTicket(
  deps: TransferDeps,
  id: string,
  req: TicketTransferRequest,
): Promise<TicketTransferResult | TransferFailure | undefined> {
  const { db, now } = deps;
  const at = now();
  const result = await db.transaction(
    async (tx): Promise<{ newId: string; from: string } | TransferFailure | undefined> => {
      const [row] = await tx
        .select({ ticket: tickets, buyerEmail: orders.buyerEmail })
        .from(tickets)
        .innerJoin(orders, eq(tickets.orderId, orders.id))
        .where(eq(tickets.id, id))
        .for('update');
      if (!row) return undefined;
      const t = row.ticket;
      if (t.transferredAt) return transferredAway(tx, id);
      if (t.checkedInAt) {
        return {
          status: 409,
          error: 'checked_in',
          message: 'This ticket has already been used at the door, so it can’t be passed on.',
        };
      }
      const event = await publishedEvent(tx, eq(events.id, t.eventId));
      if (!event || displayStatus(event, new Date(at)) === 'ended') {
        return { status: 409, error: 'event_ended', message: 'This event has ended.' };
      }
      const holder = (t.holderEmail ?? row.buyerEmail).toLowerCase();
      if (holder === req.email.toLowerCase()) {
        return {
          status: 422,
          error: 'same_holder',
          message: 'This ticket is already theirs. Enter the email of the person taking it.',
        };
      }

      const [numbered] = await tx
        .update(events)
        .set({ ticketSeq: sql`${events.ticketSeq} + 1` })
        .where(eq(events.id, t.eventId))
        .returning({ ticketSeq: events.ticketSeq });
      const newId = randomToken();
      await tx.insert(tickets).values({
        id: newId,
        code: ticketCode(t.eventId, numbered!.ticketSeq),
        orderId: t.orderId,
        eventId: t.eventId,
        index: t.index,
        holderName: req.name,
        holderEmail: req.email,
        transferredFromId: t.id,
      });
      await tx
        .update(tickets)
        .set({ transferredAt: new Date(at) })
        .where(eq(tickets.id, t.id));
      return { newId, from: t.holderName };
    },
  );
  if (!result || 'error' in result) return result;

  const emailed = await emailTransfer(deps, result.newId, result.from);
  return { email: req.email, emailed };
}

/**
 * Email a transferred ticket to its new holder, trying twice before giving up. True when it went.
 * Never throws: the transfer has happened either way.
 */
async function emailTransfer(
  deps: TransferDeps,
  ticketId: string,
  from: string,
  resendKey?: string,
): Promise<boolean> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const view = await ticketView(deps.db, deps.signingKey, ticketId);
      const [row] = await deps.db.select().from(tickets).where(eq(tickets.id, ticketId));
      if (!view || !row?.holderEmail) return false;
      await deps.mailer(
        await ticketEmail({
          buyer: { name: row.holderName, email: row.holderEmail },
          totalMinor: 0,
          tickets: [view],
          siteUrl: deps.siteUrl,
          transfer: { from, ticketId, resendKey },
        }),
      );
      return true;
    } catch (error) {
      console.error(`Transfer email for ticket ${ticketId} failed (try ${attempt})`, error);
    }
  }
  return false;
}

/**
 * "Send it again", from the link of the ticket that was passed on: emails the new holder their
 * ticket once more. Only while that ticket is still theirs (not passed on again). Undefined when
 * there is no such transfer.
 */
export async function resendTransfer(
  deps: TransferDeps,
  oldId: string,
): Promise<TicketTransferResult | TransferFailure | undefined> {
  const [old] = await deps.db.select().from(tickets).where(eq(tickets.id, oldId));
  if (!old?.transferredAt) return undefined;
  const [next] = await deps.db.select().from(tickets).where(eq(tickets.transferredFromId, oldId));
  if (!next?.holderEmail) return undefined;
  if (next.transferredAt) {
    return {
      status: 409,
      error: 'passed_on_again',
      message: 'They have passed the ticket on to someone else since, so it can’t be resent.',
    };
  }
  const emailed = await emailTransfer(
    deps,
    next.id,
    old.holderName,
    `resend-${Math.floor(deps.now() / 60_000)}`,
  );
  return { email: next.holderEmail, emailed };
}
