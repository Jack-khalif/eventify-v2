import { isStaff, SUPPORT_EMAIL } from '@eventify/shared';
import { and, eq, inArray, ne } from 'drizzle-orm';
import type { AccountRow } from './auth';
import type { Db } from './db/client';
import {
  accounts,
  events,
  loginCodes,
  organizerApplications,
  organizers,
  payouts,
  rateApprovals,
  rateChanges,
  sessions,
} from './db/schema';
import { eventHolds, PAYMENT_IN_PROGRESS, removeEvent, type Failure } from './organizer';
import { verifyPassword } from './passwords';

/**
 * Close someone's account for good, and with it their organizer profile and the events on it.
 *
 * An organizer whose events have issued tickets can't do this alone: buyers hold those tickets and
 * the sales have to stay on the books, so a person at Eventify closes the profile with them. Staff
 * are removed by a Super Admin. An account with a password has to give it again, so a phone left
 * unlocked isn't enough to lose everything.
 *
 * Tickets this person bought stay valid: they belong to the email and phone on the order, not to
 * the account. Consent records are kept for as long as the law asks (see the privacy notice).
 */
export async function deleteAccount(
  { db, now }: { db: Db; now: () => number },
  { id }: AccountRow,
  password: string | undefined,
): Promise<{ deleted: true } | Failure> {
  return db.transaction(async (tx) => {
    const [account] = await tx.select().from(accounts).where(eq(accounts.id, id)).for('update');
    // Gone already (two taps): there is nothing left to do.
    if (!account) return { deleted: true } as const;
    if (isStaff(account.role)) {
      return {
        status: 403,
        error: 'staff_account',
        message: 'Staff accounts are removed by a Super Admin.',
      };
    }
    if (account.passwordHash && !(await verifyPassword(account.passwordHash, password ?? ''))) {
      return { status: 422, error: 'invalid_credentials', message: "That password isn't right." };
    }

    // The organizer profile goes too, unless someone else still signs in to it.
    const organizerId = account.organizerId;
    const shared =
      organizerId &&
      (
        await tx
          .select({ id: accounts.id })
          .from(accounts)
          .where(and(eq(accounts.organizerId, organizerId), ne(accounts.id, account.id)))
          .limit(1)
      ).length > 0;
    const profile = organizerId && !shared ? organizerId : null;
    if (profile) {
      await tx
        .select({ id: organizers.id })
        .from(organizers)
        .where(eq(organizers.id, profile))
        .for('update');
      const posted = await tx
        .select({ id: events.id, coverImageUrl: events.coverImageUrl })
        .from(events)
        .where(eq(events.organizerId, profile))
        .for('update');
      // Every event is checked before any is removed: it is all of them or none.
      let issued = 0;
      let paying = false;
      for (const event of posted) {
        const holds = await eventHolds(tx, event.id, now());
        issued += holds.issued;
        paying ||= holds.paying;
      }
      if (issued > 0) {
        return {
          status: 409,
          error: 'tickets_issued',
          message: `${issued} ${issued === 1 ? 'ticket has' : 'tickets have'} been issued for your events, so your profile can't be deleted here. Write to ${SUPPORT_EMAIL} and we'll help you close it.`,
        };
      }
      if (paying) return PAYMENT_IN_PROGRESS;
      for (const event of posted) await removeEvent(tx, event);
      await tx.delete(rateApprovals).where(eq(rateApprovals.organizerId, profile));
      await tx.delete(rateChanges).where(eq(rateChanges.organizerId, profile));
      await tx.delete(payouts).where(eq(payouts.organizerId, profile));
      await tx.delete(organizerApplications).where(eq(organizerApplications.organizerId, profile));
    }

    await tx.delete(sessions).where(eq(sessions.accountId, account.id));
    await tx
      .delete(loginCodes)
      .where(inArray(loginCodes.email, [account.email, `reset:${account.email}`]));
    await tx.delete(accounts).where(eq(accounts.id, account.id));
    if (profile) await tx.delete(organizers).where(eq(organizers.id, profile));
    return { deleted: true } as const;
  });
}
