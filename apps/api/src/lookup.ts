import { eq } from 'drizzle-orm';
import { issueCode, redeemCode } from './codes';
import type { Db } from './db/client';
import { orders } from './db/schema';
import type { SmsSender } from './sms';
import { ticketViewsWhere } from './tickets';

export type LookupDeps = {
  db: Db;
  /** null = no SMS account yet, so tickets can't be looked up by phone. */
  sms: SmsSender | null;
  signingKey: CryptoKey;
  now: () => number;
};

/**
 * "Find my tickets", step 1: text a one-time code to the phone. Numbers with no tickets are told
 * "sent" as well (and sent nothing), so nobody can probe which numbers have bought.
 */
export async function startLookup(
  { db, sms, now }: LookupDeps,
  phone: string,
): Promise<'sent' | 'too_many' | 'unavailable'> {
  if (!sms) return 'unavailable';
  const [bought] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.buyerPhone, phone))
    .limit(1);
  if (!bought) return 'sent';

  const code = await issueCode(db, phone, now());
  if (!code) return 'too_many';
  await sms(phone, `${code} is your Eventify code to see your tickets. It works for 10 minutes.`);
  return 'sent';
}

/** Step 2: the tickets bought with this phone, or null when the code is wrong or out of date. */
export async function verifyLookup(
  { db, signingKey, now }: LookupDeps,
  phone: string,
  code: string,
) {
  if (!(await redeemCode(db, phone, code, now()))) return null;
  return ticketViewsWhere(db, signingKey, eq(orders.buyerPhone, phone));
}
