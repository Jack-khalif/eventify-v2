import { randomToken, type Session, type SessionUser } from '@eventify/shared';
import { and, eq, gt } from 'drizzle-orm';
import { issueCode, redeemCode, sha256 } from './codes';
import type { Db } from './db/client';
import { accounts, organizers, sessions } from './db/schema';
import type { Mailer } from './email/mailer';

export type AuthDeps = {
  db: Db;
  mailer: Mailer;
  superAdminEmails: readonly string[];
  now: () => number;
};

export type AccountRow = typeof accounts.$inferSelect;

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60_000;

/**
 * Email a one-time sign-in code. The answer is the same whether or not the address has an account.
 * Returns 'too_many' instead of sending when this address has been sent codes too quickly.
 */
export async function startSignIn(
  { db, mailer, now }: AuthDeps,
  email: string,
): Promise<'sent' | 'too_many'> {
  const code = await issueCode(db, email, now());
  if (!code) return 'too_many';

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
  if (!(await redeemCode(db, email, code, at))) return null;

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
