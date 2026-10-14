import {
  doorListSchema,
  importVerifyKey,
  orderViewSchema,
  sessionSchema,
  ticketLookupResultSchema,
  ticketTransferResultSchema,
  ticketViewSchema,
  verifyTicketQr,
  type OrderView,
} from '@eventify/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from './app';
import { openLocalDatabase, type Database } from './db/client';
import { seedSamples } from './db/samples';
import { events, tiers } from './db/schema';
import type { Email } from './email/mailer';
import { simulatedPayments } from './payments';

/** Passing a ticket on to someone else from its Live Pass. */

const START = Date.parse('2026-10-01T12:00:00+03:00');
const MINUTE = 60_000;

let database: Database;
let keys: CryptoKeyPair;
let verifyKey: { kty: 'OKP'; crv: 'Ed25519'; x: string };
let clock = START;
let emails: Email[] = [];
let mailerFails = false;

beforeAll(async () => {
  database = openLocalDatabase();
  await database.migrate();
  await seedSamples(database.db);
  keys = (await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as CryptoKeyPair;
  verifyKey = {
    kty: 'OKP',
    crv: 'Ed25519',
    x: (await crypto.subtle.exportKey('jwk', keys.publicKey)).x!,
  };
  await database.db.insert(events).values({
    id: 'evt_tiny',
    slug: 'tiny-gig',
    title: 'Tiny Gig',
    category: 'Music & Arts',
    city: 'Nairobi',
    currency: 'KES',
    venue: 'A Small Room',
    startsAt: new Date('2026-11-01T19:00:00+03:00'),
    endsAt: new Date('2026-11-01T23:00:00+03:00'),
    description: ['Free, but you need a ticket.'],
    coverTone: 'music',
    organizerId: 'org_amani',
    status: 'live',
    checkinCode: 'tiny-0123456789ab',
  });
  await database.db.insert(tiers).values({
    id: 'tier_tiny_free',
    eventId: 'evt_tiny',
    position: 1,
    name: 'RSVP',
    priceMinor: 0,
  });
});

afterAll(() => database.close());

beforeEach(() => {
  emails = [];
  mailerFails = false;
});

const api = () =>
  createApp({
    db: database.db,
    mailer: async (email) => {
      if (mailerFails) throw new Error('mail server is down');
      emails.push(email);
    },
    payments: simulatedPayments,
    sms: null,
    signingKey: keys.privateKey,
    verifyKey,
    siteUrl: 'https://tickets.test',
    now: () => clock,
  });

const cookies = new Map<string, string>();
const send = (path: string, token?: string, body?: unknown) =>
  api().request(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(token && { Authorization: `Bearer ${token}`, Cookie: cookies.get(token) ?? '' }),
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function get<T>(path: string, schema: z.ZodType<T>, token?: string): Promise<T> {
  const res = await send(path, token);
  expect(res.status, `GET ${path}`).toBe(200);
  return schema.parse(await res.json());
}

async function signIn(email: string): Promise<string> {
  clock += MINUTE;
  expect((await send('/auth/start', undefined, { email })).status).toBe(200);
  const code = /^(\d{6}) /.exec(emails.at(-1)!.subject)![1]!;
  const res = await send('/auth/verify', undefined, { email, code });
  const { token } = sessionSchema.parse(await res.json());
  cookies.set(token, res.headers.get('Set-Cookie')!.split(';')[0]!);
  return token;
}

/** Two free tickets for Amina, issued at once. */
async function rsvp(): Promise<OrderView> {
  const res = await send('/orders', undefined, {
    eventId: 'evt_tiny',
    tierId: 'tier_tiny_free',
    quantity: 2,
    buyer: { name: 'Amina Otieno', phone: '+254712345678', email: 'amina@example.com' },
    paymentMethod: null,
  });
  expect(res.status).toBe(201);
  emails = [];
  return orderViewSchema.parse(await res.json());
}

const transfer = (ticketId: string, to = { name: 'Wanjiru Kamau', email: 'wanjiru@example.com' }) =>
  send(`/tickets/${ticketId}/transfer`, undefined, to);

const sync = (checkIns: { ticketId: string; at: string }[]) =>
  send('/checkin/tiny-0123456789ab/sync', undefined, {
    door: 'Main Gate',
    checkIns: checkIns.map((c) => ({ ...c, offline: true })),
  });

describe('transferring a ticket', () => {
  it('issues the recipient a new ticket and stops the old one working everywhere', async () => {
    const order = await rsvp();
    const [mine, kept] = order.tickets;
    const before = await get(`/tickets/${mine!.id}`, ticketViewSchema);

    const res = await transfer(mine!.id);
    expect(res.status).toBe(200);
    expect(ticketTransferResultSchema.parse(await res.json())).toEqual({
      email: 'wanjiru@example.com',
      emailed: true,
    });

    // The recipient's email: their own pass, from Amina, without the buyer's order link.
    expect(emails).toHaveLength(1);
    const email = emails[0]!;
    expect(email).toMatchObject({
      to: 'wanjiru@example.com',
      subject: 'Amina Otieno sent you a ticket for Tiny Gig',
    });
    expect(email.text).toContain('Transferred to you by Amina Otieno');
    expect(email.text).not.toContain(order.id);
    const newId = /\/t\/([\w-]+)/.exec(email.text)![1]!;

    const fresh = await get(`/tickets/${newId}`, ticketViewSchema);
    expect(fresh).toMatchObject({ holderName: 'Wanjiru Kamau', index: 1, count: 1 });
    expect(fresh.code).not.toBe(before.code);
    expect(fresh.passSecret).not.toBe(before.passSecret);
    const key = await importVerifyKey(verifyKey);
    expect(await verifyTicketQr(key, fresh.qrPayload)).toBe(newId);

    // The old link says where it went; the order link only shows what Amina still holds.
    const old = await send(`/tickets/${mine!.id}`);
    expect(old.status).toBe(410);
    expect(await old.json()).toMatchObject({
      error: 'transferred',
      message: expect.stringContaining('transferred to w•••@example.com on'),
    });
    const after = orderViewSchema.parse(await (await send(`/orders/${order.id}`)).json());
    expect(after.tickets.map((t) => t.id)).toEqual([kept!.id]);

    // The door has the new ticket under Wanjiru, and not the old one, even from a stale device.
    const door = await get('/checkin/tiny-0123456789ab', doorListSchema);
    // It keeps the old one aside, so an old pass is turned away as transferred.
    expect(door.transferred).toEqual([
      { ticketId: mine!.id, code: before.code, passSecret: before.passSecret },
    ]);
    expect(door.guests.map((g) => g.ticketId).sort()).toEqual([kept!.id, newId].sort());
    expect(door.guests.find((g) => g.ticketId === newId)).toMatchObject({
      name: 'Wanjiru Kamau',
      phone: '',
      code: fresh.code,
    });
    const synced = doorListSchema.parse(
      await (await sync([{ ticketId: mine!.id, at: '2026-10-01T12:05:00+03:00' }])).json(),
    );
    expect(synced.guests.every((g) => g.checkedInAt === null)).toBe(true);

    // Each finds their own tickets by email.
    const wanjiru = await get(
      '/me/tickets',
      ticketLookupResultSchema,
      await signIn('Wanjiru@Example.com'),
    );
    expect(wanjiru.tickets.map((t) => t.id)).toEqual([newId]);
    const amina = await get(
      '/me/tickets',
      ticketLookupResultSchema,
      await signIn('amina@example.com'),
    );
    expect(amina.tickets.map((t) => t.id)).toEqual([kept!.id]);

    // It can be passed on again, but the old link can't do anything.
    expect(
      (await transfer(mine!.id, { name: 'Someone Else', email: 'x@example.com' })).status,
    ).toBe(410);
    const onward = await transfer(newId, { name: 'Baraka Odhiambo', email: 'baraka@example.com' });
    expect(onward.status).toBe(200);
    expect((await send(`/tickets/${newId}`)).status).toBe(410);
  });

  it('refuses a ticket already used at the door, or one going to who holds it', async () => {
    const [used, other] = (await rsvp()).tickets;
    expect((await sync([{ ticketId: used!.id, at: '2026-10-01T12:30:00+03:00' }])).status).toBe(
      200,
    );
    const res = await transfer(used!.id);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'checked_in' });

    const self = await transfer(other!.id, { name: 'Amina', email: 'AMINA@example.com' });
    expect(self.status).toBe(422);
    expect(await self.json()).toMatchObject({ error: 'same_holder' });

    expect((await transfer('no-such-ticket')).status).toBe(404);
    const bad = await transfer(other!.id, { name: 'W', email: 'wanjiru@example.com' });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ message: 'Enter their name' });
  });

  it('still transfers when the email can’t go out, and stops once the event is over', async () => {
    const [first, second] = (await rsvp()).tickets;
    mailerFails = true;
    const res = await transfer(first!.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: 'wanjiru@example.com', emailed: false });
    expect((await send(`/tickets/${first!.id}`)).status).toBe(410);

    mailerFails = false;
    await database.db
      .update(events)
      .set({ endsAt: new Date(clock - MINUTE) })
      .where(eq(events.id, 'evt_tiny'));
    const late = await transfer(second!.id);
    expect(late.status).toBe(409);
    expect(await late.json()).toMatchObject({ error: 'event_ended' });
  });
});
