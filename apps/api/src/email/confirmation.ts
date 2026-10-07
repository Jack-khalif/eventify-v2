import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { orders } from '../db/schema';
import { orderTicketViews } from '../tickets';
import type { Mailer } from './mailer';
import { ticketEmail } from './ticketEmail';

export type ConfirmationDeps = {
  db: Db;
  mailer: Mailer;
  signingKey: CryptoKey;
  siteUrl: string;
  now: () => number;
};

const MAX_ATTEMPTS = 3;
/** How long one attempt owns the order before another request may try again. */
const ATTEMPT_WINDOW_MS = 60_000;

/**
 * Email a paid order's tickets, once. Safe to call on every read of the order: it only sends if
 * nothing has gone out yet, and a failed send is retried on a later call (three tries at most).
 * Never throws, because the buyer already has their tickets on screen.
 */
export async function sendTicketEmail(deps: ConfirmationDeps, orderId: string): Promise<void> {
  const { db, now } = deps;
  try {
    // Claim the attempt in one statement so two requests arriving together can't both send.
    const [order] = await db
      .update(orders)
      .set({ emailAttempts: sql`${orders.emailAttempts} + 1`, emailAttemptAt: new Date(now()) })
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.status, 'paid'),
          isNull(orders.emailSentAt),
          lt(orders.emailAttempts, MAX_ATTEMPTS),
          or(
            isNull(orders.emailAttemptAt),
            lt(orders.emailAttemptAt, new Date(now() - ATTEMPT_WINDOW_MS)),
          ),
        ),
      )
      .returning();
    if (!order) return;

    const tickets = await orderTicketViews(db, deps.signingKey, order.id);
    if (tickets.length === 0) return;
    await deps.mailer(
      await ticketEmail({
        buyer: { name: order.buyerName, email: order.buyerEmail },
        orderId: order.id,
        totalMinor: order.totalMinor,
        tickets,
        siteUrl: deps.siteUrl,
      }),
    );
    await db
      .update(orders)
      .set({ emailSentAt: new Date(now()) })
      .where(eq(orders.id, order.id));
  } catch (error) {
    console.error(`Ticket email for order ${orderId} failed`, error);
  }
}
