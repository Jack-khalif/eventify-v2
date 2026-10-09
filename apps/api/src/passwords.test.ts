import {
  ORGANIZER_TERMS_VERSION,
  PRIVACY_NOTICE_VERSION,
  sessionSchema,
  sessionUserSchema,
  staffRowSchema,
  ticketLookupResultSchema,
} from '@eventify/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { openLocalDatabase, type Database } from './db/client';
import { seedSamples } from './db/samples';
import { accounts, consents } from './db/schema';
import type { Email } from './email/mailer';
import { simulatedPayments } from './payments';

/** Organizers signing up and signing in with a password. */

const MINUTE = 60_000;
let database: Database;
let keys: CryptoKeyPair;
let clock = Date.parse('2026-10-01T12:00:00+03:00');
const emails: Email[] = [];

beforeAll(async () => {
  database = openLocalDatabase();
  await database.migrate();
  await seedSamples(database.db);
  keys = (await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as CryptoKeyPair;
});
afterAll(() => database.close());

/** One app for the file, so the limits on guessing add up across requests. */
let app: ReturnType<typeof createApp> | undefined;
const api = () =>
  (app ??= createApp({
    db: database.db,
    mailer: async (email) => void emails.push(email),
    payments: simulatedPayments,
    sms: null,
    signingKey: keys.privateKey,
    verifyKey: { kty: 'OKP', crv: 'Ed25519', x: 'unused-here' },
    siteUrl: 'https://tickets.test',
    superAdminEmails: ['boss@example.com'],
    now: () => clock,
  }));

type Who = { token: string; cookie: string };

const send = (path: string, who?: Who, body?: unknown) =>
  api().request(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(who && { Authorization: `Bearer ${who.token}`, Cookie: who.cookie }),
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const errorOf = async (res: Response) => ({
  status: res.status,
  error: ((await res.json()) as { error: string }).error,
});

const opened = async (res: Response): Promise<Who> => ({
  token: sessionSchema.parse(await res.json()).token,
  cookie: res.headers.get('Set-Cookie')!.split(';')[0]!,
});

async function withCode(email: string): Promise<Who> {
  clock += MINUTE;
  await send('/auth/start', undefined, { email });
  const code = /^(\d{6}) /.exec(emails.at(-1)!.subject)![1]!;
  return opened(await send('/auth/verify', undefined, { email, code }));
}

const PASSWORD = 'clay and kilns';
const signUp = (over: object = {}) =>
  send('/organizer/signup', undefined, {
    email: ' Wanjiku@Example.com',
    password: PASSWORD,
    contactName: 'Wanjiku Kamau',
    organizerName: 'Kiln Club',
    type: 'Community group',
    city: 'Nairobi',
    category: 'Workshops',
    payoutMethod: 'mpesa',
    about: 'We run monthly pottery workshops for beginners in Karen.',
    acceptTerms: true,
    consentToDataProcessing: true,
    termsVersion: ORGANIZER_TERMS_VERSION,
    privacyVersion: PRIVACY_NOTICE_VERSION,
    ...over,
  });
const logIn = (email: string, password: string) =>
  send('/auth/login', undefined, { email, password });

describe('signing up as an organizer', () => {
  it('needs a real password, both ticks and the current terms', async () => {
    expect((await signUp({ password: 'short' })).status).toBe(400);
    expect((await signUp({ acceptTerms: false })).status).toBe(400);
    expect(await errorOf(await signUp({ termsVersion: '2020-01-01' }))).toEqual({
      status: 409,
      error: 'terms_changed',
    });
    expect(await database.db.select().from(consents)).toEqual([]);
  });

  it('makes the account and the application together, signed in and waiting for approval', async () => {
    const res = await signUp();
    expect(res.status).toBe(201);
    const who = await opened(res);
    const me = sessionUserSchema.parse(await (await send('/auth/me', who)).json());
    expect(me).toMatchObject({
      email: 'wanjiku@example.com',
      name: 'Wanjiku Kamau',
      role: 'organizer',
      organizer: { handle: 'kiln-club', status: 'pending' },
    });

    const [row] = await database.db
      .select()
      .from(accounts)
      .where(eq(accounts.email, 'wanjiku@example.com'));
    expect(row!.passwordHash).toMatch(/^scrypt\$/);
    expect(row!.passwordHash).not.toContain(PASSWORD);
    expect(row!.emailVerifiedAt).toBeNull();
    expect(await database.db.select().from(consents)).toHaveLength(2);
  });

  it('never hands over an address that already has an account, or a Super Admin’s', async () => {
    const taken = { status: 409, error: 'email_taken' };
    expect(await errorOf(await signUp({ password: 'someone else' }))).toEqual(taken);
    expect(await errorOf(await signUp({ email: 'organizer@eventify.test' }))).toEqual(taken);
    expect(await errorOf(await signUp({ email: 'boss@example.com' }))).toEqual(taken);
    expect((await logIn('wanjiku@example.com', 'someone else')).status).toBe(422);
  });
});

describe('signing in with a password', () => {
  const wrong = { status: 422, error: 'invalid_credentials' };

  it('opens a session for the right password and says the same for every wrong one', async () => {
    const who = await opened(await logIn('WANJIKU@example.com ', PASSWORD));
    expect((await send('/auth/me', who)).status).toBe(200);

    expect(await errorOf(await logIn('wanjiku@example.com', 'clay and kiln'))).toEqual(wrong);
    expect(await errorOf(await logIn('nobody@example.com', PASSWORD))).toEqual(wrong);
    // Accounts made with an emailed code have no password to guess.
    expect(await errorOf(await logIn('organizer@eventify.test', ''))).toEqual(wrong);
  });

  it('keeps tickets bought with the address back until a code has shown it is theirs', async () => {
    const order = await send('/orders', undefined, {
      eventId: 'evt_sauti',
      tierId: 'tier_sauti_regular',
      quantity: 1,
      buyer: { name: 'Wanjiku Kamau', phone: '+254712345678', email: 'wanjiku@example.com' },
      paymentMethod: 'mpesa',
    });
    expect(order.status).toBe(201);
    const { id } = (await order.json()) as { id: string };
    clock += 5_000;
    await send(`/orders/${id}`);

    const mine = async (who: Who) =>
      ticketLookupResultSchema.parse(await (await send('/me/tickets', who)).json()).tickets;
    expect(await mine(await opened(await logIn('wanjiku@example.com', PASSWORD)))).toEqual([]);
    expect(await mine(await withCode('wanjiku@example.com'))).toHaveLength(1);
  });

  it('is not for staff: adding someone as staff drops their password and signs them out', async () => {
    const squatter = await opened(await signUp({ email: 'newagent@example.com' }));
    const boss = await withCode('boss@example.com');
    const add = { email: 'newagent@example.com', name: 'New Agent', role: 'agent' };
    expect((await send('/admin/staff', boss, add)).status).toBe(409); // an organizer's address

    const fresh = await opened(await signUp({ email: 'fresh@example.com' }));
    await database.db
      .update(accounts)
      .set({ role: 'attendee', organizerId: null })
      .where(eq(accounts.email, 'fresh@example.com'));
    const added = await send('/admin/staff', boss, { ...add, email: 'fresh@example.com' });
    expect(staffRowSchema.parse(await added.json()).role).toBe('agent');
    expect((await send('/auth/me', fresh)).status).toBe(401);
    expect(await errorOf(await logIn('fresh@example.com', PASSWORD))).toEqual(wrong);
    expect((await send('/auth/me', squatter)).status).toBe(200);
  });

  it('stops after ten tries at one account', async () => {
    clock += 20 * MINUTE;
    for (let i = 0; i < 10; i++) {
      expect((await logIn('wanjiku@example.com', `guess ${i}`)).status).toBe(422);
    }
    expect((await logIn('wanjiku@example.com', PASSWORD)).status).toBe(429);
    clock += 15 * MINUTE;
    expect((await logIn('wanjiku@example.com', PASSWORD)).status).toBe(200);
  });
});
