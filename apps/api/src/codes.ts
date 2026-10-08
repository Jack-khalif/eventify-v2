import { eq } from 'drizzle-orm';
import { createHash, randomInt } from 'node:crypto';
import type { Db } from './db/client';
import { loginCodes } from './db/schema';

/**
 * One-time 6-digit codes, sent to an email address (sign-in) or a phone number ("Find my tickets").
 * Only a hash is stored, a code works once, and each address is limited in how often it can be
 * sent one and how many wrong guesses it allows.
 */

export const CODE_LIFETIME_MS = 10 * 60_000;
/** Wrong guesses allowed before a code stops working (a 6-digit code must not be guessable). */
export const MAX_CODE_ATTEMPTS = 5;
/** One address can't be sent codes faster or more often than this, whoever is asking. */
export const RESEND_AFTER_MS = 30_000;
export const MAX_CODES_PER_HOUR = 5;
const HOUR_MS = 60 * 60_000;

export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const hashCode = (address: string, code: string) => sha256(`${address}:${code}`);

/** A new code for this address, or null when it has been sent codes too quickly. */
export async function issueCode(db: Db, address: string, at: number): Promise<string | null> {
  const code = String(randomInt(1_000_000)).padStart(6, '0');
  const allowed = await db.transaction(async (tx) => {
    const [last] = await tx
      .select()
      .from(loginCodes)
      .where(eq(loginCodes.email, address))
      .for('update');
    const sameHour = last !== undefined && at - last.hourStartedAt.getTime() < HOUR_MS;
    if (last && at - last.sentAt.getTime() < RESEND_AFTER_MS) return false;
    if (last && sameHour && last.sentThisHour >= MAX_CODES_PER_HOUR) return false;

    const next = {
      codeHash: hashCode(address, code),
      expiresAt: new Date(at + CODE_LIFETIME_MS),
      attempts: 0,
      sentAt: new Date(at),
      sentThisHour: sameHour ? last.sentThisHour + 1 : 1,
      hourStartedAt: sameHour ? last.hourStartedAt : new Date(at),
    };
    await tx
      .insert(loginCodes)
      .values({ email: address, ...next })
      .onConflictDoUpdate({ target: loginCodes.email, set: next });
    return true;
  });
  return allowed ? code : null;
}

/** Use up the code sent to this address. False when it is wrong, already used or out of date. */
export function redeemCode(db: Db, address: string, code: string, at: number): Promise<boolean> {
  // Its own transaction, so a wrong guess is counted even though nothing else happens.
  return db.transaction(async (tx) => {
    const [sent] = await tx
      .select()
      .from(loginCodes)
      .where(eq(loginCodes.email, address))
      .for('update');
    if (!sent || at >= sent.expiresAt.getTime() || sent.attempts >= MAX_CODE_ATTEMPTS) return false;
    if (sent.codeHash !== hashCode(address, code)) {
      await tx
        .update(loginCodes)
        .set({ attempts: sent.attempts + 1 })
        .where(eq(loginCodes.email, address));
      return false;
    }
    // A code works once. The send counters stay, so using one doesn't reset the hourly limit.
    await tx
      .update(loginCodes)
      .set({ attempts: MAX_CODE_ATTEMPTS })
      .where(eq(loginCodes.email, address));
    return true;
  });
}
