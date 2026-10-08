import { isStaff, randomToken, type Session, type SessionUser } from '@eventify/shared';
import { and, eq, gt } from 'drizzle-orm';
import { issueCode, redeemCode, sha256 } from './codes';
import type { Db } from './db/client';
import { accounts, organizers, sessions } from './db/schema';
import type { Mailer } from './email/mailer';
import { generateTotpSecret, matchTotp } from './totp';

export type AuthDeps = {
  db: Db;
  mailer: Mailer;
  superAdminEmails: readonly string[];
  now: () => number;
};

export type AccountRow = typeof accounts.$inferSelect;

const HOUR_MS = 60 * 60_000;
const SESSION_LIFETIME_MS = 30 * 24 * HOUR_MS;
/** Agents and Super Admins can move money and approve organizers, so they sign in again each day. */
const STAFF_SESSION_LIFETIME_MS = 12 * HOUR_MS;

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

/**
 * A sign-in the browser holds in two halves. `secret` goes in a cookie scripts can't read, so a
 * malicious script on the page can't carry the session off. `token` is derived from it and sent
 * back in the Authorization header: no use on its own, but only our own pages can send it, which
 * stops other sites riding on the cookie.
 */
export type OpenedSession = { session: Session; secret: string; maxAgeSeconds: number };
export type SignInOutcome = OpenedSession | { totpRequired: true; challenge: string } | null;

const publicHalf = (secret: string) => sha256(`public-half:${secret}`);
const CHALLENGE_LIFETIME_MS = 10 * 60_000;
const MAX_TOTP_ATTEMPTS = 5;

async function openSession(db: Db, account: AccountRow, at: number): Promise<OpenedSession> {
  const lifetime = isStaff(account.role) ? STAFF_SESSION_LIFETIME_MS : SESSION_LIFETIME_MS;
  const secret = randomToken(32);
  await db.insert(sessions).values({
    tokenHash: sha256(secret),
    accountId: account.id,
    expiresAt: new Date(at + lifetime),
    createdAt: new Date(at),
  });
  return {
    session: { token: publicHalf(secret), user: await toSessionUser(db, account) },
    secret,
    maxAgeSeconds: lifetime / 1000,
  };
}

/**
 * Exchange the emailed code for a session, or, for an account with two-step sign-in, for a
 * challenge that the authenticator code completes. Null when the code is wrong, used up or old.
 */
export async function verifySignIn(
  { db, superAdminEmails, now }: AuthDeps,
  email: string,
  code: string,
): Promise<SignInOutcome> {
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
  if (!account!.totpEnabledAt) return openSession(db, account!, at);

  const challenge = randomToken(32);
  await db.insert(sessions).values({
    tokenHash: sha256(challenge),
    accountId: account!.id,
    expiresAt: new Date(at + CHALLENGE_LIFETIME_MS),
    createdAt: new Date(at),
    pendingTotp: true,
  });
  return { totpRequired: true, challenge };
}

/** Accept an authenticator code for this account once. Call inside a transaction. */
async function redeemTotp(tx: Db, accountId: string, code: string, at: number): Promise<boolean> {
  const [account] = await tx
    .select()
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .for('update');
  if (!account?.totpSecret) return false;
  const step = matchTotp(account.totpSecret, code, at, account.totpLastStep);
  if (step === null) return false;
  await tx.update(accounts).set({ totpLastStep: step }).where(eq(accounts.id, accountId));
  return true;
}

/** The second step: the challenge from verifySignIn plus the app's code. Null when either is wrong. */
export async function completeTotpSignIn(
  { db, now }: Pick<AuthDeps, 'db' | 'now'>,
  challenge: string,
  code: string,
): Promise<OpenedSession | null> {
  const at = now();
  const account = await db.transaction(async (tx) => {
    const [pending] = await tx
      .select()
      .from(sessions)
      .where(and(eq(sessions.tokenHash, sha256(challenge)), eq(sessions.pendingTotp, true)))
      .for('update');
    if (!pending || at >= pending.expiresAt.getTime()) return null;
    if (!(await redeemTotp(tx, pending.accountId, code, at))) {
      // A few wrong codes and the emailed code has to be asked for again.
      if (pending.totpAttempts + 1 >= MAX_TOTP_ATTEMPTS) {
        await tx.delete(sessions).where(eq(sessions.tokenHash, pending.tokenHash));
      } else {
        await tx
          .update(sessions)
          .set({ totpAttempts: pending.totpAttempts + 1 })
          .where(eq(sessions.tokenHash, pending.tokenHash));
      }
      return null;
    }
    await tx.delete(sessions).where(eq(sessions.tokenHash, pending.tokenHash));
    const [row] = await tx.select().from(accounts).where(eq(accounts.id, pending.accountId));
    return row!;
  });
  return account && openSession(db, account, at);
}

/** Start setting up an authenticator app: a new secret, not in use until a code from it is confirmed. */
export async function beginTotpSetup(db: Db, account: AccountRow): Promise<string | null> {
  if (account.totpEnabledAt) return null;
  const secret = generateTotpSecret();
  await db
    .update(accounts)
    .set({ totpSecret: secret, totpLastStep: null })
    .where(eq(accounts.id, account.id));
  return secret;
}

/** Turn two-step sign-in on (once the app shows the right code) or off (which also needs a code). */
export function setTotpEnabled(
  { db, now }: Pick<AuthDeps, 'db' | 'now'>,
  account: AccountRow,
  enabled: boolean,
  code: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    if (enabled === !!account.totpEnabledAt) return false;
    if (!(await redeemTotp(tx, account.id, code, now()))) return false;
    await tx
      .update(accounts)
      .set(
        enabled
          ? { totpEnabledAt: new Date(now()) }
          : { totpEnabledAt: null, totpSecret: null, totpLastStep: null },
      )
      .where(eq(accounts.id, account.id));
    return true;
  });
}

export type Credentials = { cookie: string | undefined; authorization: string | undefined };

/** The session secret, if the request carries both halves and they belong together. */
function secretOf({ cookie, authorization }: Credentials): string | null {
  const token = /^Bearer (.+)$/.exec(authorization ?? '')?.[1];
  return cookie && token && publicHalf(cookie) === token ? cookie : null;
}

/** The account behind a request, or null if it isn't a live session. */
export async function accountForRequest(
  { db, now }: Pick<AuthDeps, 'db' | 'now'>,
  credentials: Credentials,
): Promise<AccountRow | null> {
  const secret = secretOf(credentials);
  if (!secret) return null;
  const [row] = await db
    .select({ account: accounts })
    .from(sessions)
    .innerJoin(accounts, eq(sessions.accountId, accounts.id))
    .where(
      and(
        eq(sessions.tokenHash, sha256(secret)),
        eq(sessions.pendingTotp, false),
        gt(sessions.expiresAt, new Date(now())),
      ),
    );
  return row?.account ?? null;
}

export const sessionUserFor = toSessionUser;

export async function endSession(db: Db, credentials: Credentials) {
  const secret = secretOf(credentials);
  if (secret) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(secret)));
}

/** Sign an account out everywhere, e.g. when its staff access is taken away. */
export const endAllSessions = (db: Db, accountId: string) =>
  db.delete(sessions).where(eq(sessions.accountId, accountId));
