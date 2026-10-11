import { isStaff, randomToken, type Session, type SessionUser } from '@eventify/shared';
import { and, eq, gt } from 'drizzle-orm';
import { issueCode, redeemCode, sha256 } from './codes';
import type { Db } from './db/client';
import { accounts, organizers, sessions } from './db/schema';
import { codeEmail } from './email/codeEmail';
import type { Mailer } from './email/mailer';
import { hashPassword, verifyPassword } from './passwords';
import { generateTotpSecret, matchTotp } from './totp';

export type AuthDeps = {
  db: Db;
  mailer: Mailer;
  /** Web app origin, for the logo and link in emails. */
  siteUrl: string;
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
  { db, mailer, siteUrl, now }: AuthDeps,
  email: string,
): Promise<'sent' | 'too_many'> {
  const code = await issueCode(db, email, now());
  if (!code) return 'too_many';

  await mailer(
    codeEmail({
      to: email,
      siteUrl,
      code,
      name: 'sign-in code',
      instruction: 'Enter this code on the Eventify sign-in page to finish signing in.',
      ifNotYou:
        "Didn't ask for it? You can ignore this email. Nobody can sign in without the code.",
    }),
  );
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

export async function openSession(db: Db, account: AccountRow, at: number): Promise<OpenedSession> {
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
  // Entering the code is the proof that the address is theirs.
  const [account] = await db
    .update(accounts)
    .set({
      emailVerifiedAt: new Date(at),
      ...(isSuperAdmin && { role: 'super_admin' as const, passwordHash: null }),
    })
    .where(eq(accounts.email, email))
    .returning();
  return afterFirstStep(db, account!, at);
}

/** The first step was right: a session, or the authenticator challenge if the account uses one. */
async function afterFirstStep(db: Db, account: AccountRow, at: number): Promise<SignInOutcome> {
  if (!account.totpEnabledAt) return openSession(db, account, at);

  const challenge = randomToken(32);
  await db.insert(sessions).values({
    tokenHash: sha256(challenge),
    accountId: account.id,
    expiresAt: new Date(at + CHALLENGE_LIFETIME_MS),
    createdAt: new Date(at),
    pendingTotp: true,
  });
  return { totpRequired: true, challenge };
}

/**
 * Sign in with a password. Null when the email or the password is wrong; the caller says the same
 * thing for both. Staff can't: their access is worth more than a password, so they use the code.
 */
export async function signInWithPassword(
  { db, now }: Pick<AuthDeps, 'db' | 'now'>,
  email: string,
  password: string,
): Promise<SignInOutcome> {
  const [account] = await db.select().from(accounts).where(eq(accounts.email, email));
  const matches = await verifyPassword(account?.passwordHash ?? null, password);
  if (!account || !matches || isStaff(account.role)) return null;
  return afterFirstStep(db, account, now());
}

/** Reset codes are kept apart from sign-in codes, so one can never be used as the other. */
const resetAddress = (email: string) => `reset:${email}`;

/**
 * Email a code for choosing a new password. Like startSignIn, the answer is the same whether or
 * not the address has an account; only an account that can have a password is sent anything.
 */
export async function startPasswordReset(
  { db, mailer, siteUrl, now }: AuthDeps,
  email: string,
): Promise<'sent' | 'too_many'> {
  const code = await issueCode(db, resetAddress(email), now());
  if (!code) return 'too_many';
  const [account] = await db.select().from(accounts).where(eq(accounts.email, email));
  if (!account || isStaff(account.role)) return 'sent';

  await mailer(
    codeEmail({
      to: email,
      siteUrl,
      code,
      name: 'password reset code',
      instruction: 'Enter this code on the Eventify sign-in page to choose a new password.',
      ifNotYou: "Didn't ask for it? You can ignore this email. Your password stays as it is.",
    }),
  );
  return 'sent';
}

/**
 * Set the new password and sign in with it, ending every other session. Null when the code is
 * wrong, used up or old.
 */
export async function finishPasswordReset(
  { db, now }: Pick<AuthDeps, 'db' | 'now'>,
  email: string,
  code: string,
  password: string,
): Promise<SignInOutcome> {
  const at = now();
  if (!(await redeemCode(db, resetAddress(email), code, at))) return null;
  const [existing] = await db.select().from(accounts).where(eq(accounts.email, email));
  if (!existing || isStaff(existing.role)) return null;

  // Entering the code is the proof that the address is theirs.
  const [account] = await db
    .update(accounts)
    .set({ passwordHash: await hashPassword(password), emailVerifiedAt: new Date(at) })
    .where(eq(accounts.id, existing.id))
    .returning();
  await endAllSessions(db, existing.id);
  return afterFirstStep(db, account!, at);
}

/**
 * A new account that signs in with a password. Null when the address already has an account, or
 * is a Super Admin's: nobody has shown the address is theirs, so it must not open anything that exists.
 */
export async function createPasswordAccount(
  db: Db,
  superAdminEmails: readonly string[],
  email: string,
  password: string,
): Promise<AccountRow | null> {
  if (superAdminEmails.includes(email)) return null;
  const [account] = await db
    .insert(accounts)
    .values({
      id: `acc_${randomToken(8)}`,
      email,
      role: 'attendee',
      passwordHash: await hashPassword(password),
    })
    .onConflictDoNothing({ target: accounts.email })
    .returning();
  return account ?? null;
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
