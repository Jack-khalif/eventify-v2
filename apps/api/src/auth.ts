import { randomToken, type Session, type SessionUser } from '@eventify/shared';
import { and, eq, gt } from 'drizzle-orm';
import { createHash, randomInt } from 'node:crypto';
import type { Db } from './db/client';
import { accounts, loginCodes, organizers, sessions } from './db/schema';
import type { Mailer } from './email/mailer';

export type AuthDeps = {
  db: Db;
  mailer: Mailer;
  superAdminEmails: readonly string[];
  now: () => number;
};

export type AccountRow = typeof accounts.$inferSelect;

export const CODE_LIFETIME_MS = 10 * 60_000;
/** Wrong guesses allowed before a code stops working (a 6-digit code must not be guessable). */
export const MAX_CODE_ATTEMPTS = 5;
/** One address can't be sent codes faster or more often than this, whoever is asking. */
export const RESEND_AFTER_MS = 30_000;
export const MAX_CODES_PER_HOUR = 5;
const HOUR_MS = 60 * 60_000;
const SESSION_LIFETIME_MS = 30 * 24 * HOUR_MS;

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const hashCode = (email: string, code: string) => sha256(`${email}:${code}`);

/**
 * Email a one-time sign-in code. The answer is the same whether or not the address has an account.
 * Returns 'too_many' instead of sending when this address has been sent codes too quickly.
 */
export async function startSignIn(
  { db, mailer, now }: AuthDeps,
  email: string,
): Promise<'sent' | 'too_many'> {
  const at = now();
  const code = String(randomInt(1_000_000)).padStart(6, '0');

  const allowed = await db.transaction(async (tx) => {
    const [last] = await tx
      .select()
      .from(loginCodes)
      .where(eq(loginCodes.email, email))
      .for('update');
    const sameHour = last !== undefined && at - last.hourStartedAt.getTime() < HOUR_MS;
    if (last && at - last.sentAt.getTime() < RESEND_AFTER_MS) return false;
    if (last && sameHour && last.sentThisHour >= MAX_CODES_PER_HOUR) return false;

    const next = {
      codeHash: hashCode(email, code),
      expiresAt: new Date(at + CODE_LIFETIME_MS),
      attempts: 0,
      sentAt: new Date(at),
      sentThisHour: sameHour ? last.sentThisHour + 1 : 1,
      hourStartedAt: sameHour ? last.hourStartedAt : new Date(at),
    };
    await tx
      .insert(loginCodes)
      .values({ email, ...next })
      .onConflictDoUpdate({ target: loginCodes.email, set: next });
    return true;
  });
  if (!allowed) return 'too_many';

  await mailer({
    to: email,
    subject: `${code} is your Eventify sign-in code`,
    text: `Your Eventify sign-in code is ${code}\n\nIt works for 10 minutes. If you didn't ask for it, you can ignore this email.`,
    html: `<div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0e1a1c;max-width:420px">
  <p style="font-size:15px">Your Eventify sign-in code is</p>
  <p style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:32px;font-weight:800;letter-spacing:0.2em;margin:8px 0 16px">${code}</p>
  <p style="font-size:13px;color:#56666a">It works for 10 minutes. If you didn't ask for it, you can ignore this email.</p>
</div>`,
  });
  return 'sent';
}

async function toSessionUser(db: Db, account: AccountRow): Promise<SessionUser> {
  const [o] = account.organizerId
    ? await db.select().from(organizers).where(eq(organizers.id, account.organizerId))
    : [];
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
    organizer: o ? { id: o.id, handle: o.handle, name: o.name, status: o.status } : null,
  };
}

/** Exchange the emailed code for a session. Null when the code is wrong, used up or out of date. */
export async function verifySignIn(
  { db, superAdminEmails, now }: AuthDeps,
  email: string,
  code: string,
): Promise<Session | null> {
  const at = now();
  // Decided in its own transaction, so a wrong guess is counted even though nothing else happens.
  const ok = await db.transaction(async (tx) => {
    const [sent] = await tx
      .select()
      .from(loginCodes)
      .where(eq(loginCodes.email, email))
      .for('update');
    if (!sent || at >= sent.expiresAt.getTime() || sent.attempts >= MAX_CODE_ATTEMPTS) return false;
    if (sent.codeHash !== hashCode(email, code)) {
      await tx
        .update(loginCodes)
        .set({ attempts: sent.attempts + 1 })
        .where(eq(loginCodes.email, email));
      return false;
    }
    // A code works once. The send counters stay, so signing in doesn't reset the hourly limit.
    await tx
      .update(loginCodes)
      .set({ attempts: MAX_CODE_ATTEMPTS })
      .where(eq(loginCodes.email, email));
    return true;
  });
  if (!ok) return null;

  const isSuperAdmin = superAdminEmails.includes(email);
  await db
    .insert(accounts)
    .values({
      id: `acc_${randomToken(8)}`,
      email,
      role: isSuperAdmin ? 'super_admin' : 'attendee',
    })
    .onConflictDoNothing({ target: accounts.email });
  if (isSuperAdmin) {
    await db.update(accounts).set({ role: 'super_admin' }).where(eq(accounts.email, email));
  }
  const [account] = await db.select().from(accounts).where(eq(accounts.email, email));

  const token = randomToken(32);
  await db.insert(sessions).values({
    tokenHash: sha256(token),
    accountId: account!.id,
    expiresAt: new Date(at + SESSION_LIFETIME_MS),
    createdAt: new Date(at),
  });
  return { token, user: await toSessionUser(db, account!) };
}

const bearerToken = (header: string | undefined) => /^Bearer (.+)$/.exec(header ?? '')?.[1] ?? null;

/** The account behind an `Authorization: Bearer …` header, or null if it isn't a live session. */
export async function accountForRequest(
  { db, now }: Pick<AuthDeps, 'db' | 'now'>,
  authorization: string | undefined,
): Promise<AccountRow | null> {
  const token = bearerToken(authorization);
  if (!token) return null;
  const [row] = await db
    .select({ account: accounts })
    .from(sessions)
    .innerJoin(accounts, eq(sessions.accountId, accounts.id))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date(now()))));
  return row?.account ?? null;
}

export const sessionUserFor = toSessionUser;

export async function endSession(db: Db, authorization: string | undefined) {
  const token = bearerToken(authorization);
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
}
