import {
  attendeeListSchema,
  compListSchema,
  eventDashboardSchema,
  organizerHomeSchema,
  sessionSchema,
  ticketsResultSchema,
  type CompRequest,
} from '@eventify/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from './app';
import { openLocalDatabase, type Database } from './db/client';
import { seedSamples } from './db/samples';
import { events, organizers, tiers } from './db/schema';
import type { Email } from './email/mailer';
import { simulatedPayments } from './payments';

/** Complimentary tickets an organizer issues from the dashboard. */

const START = Date.parse('2026-10-01T12:00:00+03:00');
const MINUTE = 60_000;

let database: Database;
let keys: CryptoKeyPair;
let clock = START;
let emails: Email[] = [];

beforeAll(async () => {
  database = openLocalDatabase();
  await database.migrate();
  await seedSamples(database.db);
  keys = (await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as CryptoKeyPair;

  // Amani's: three paid places, and a guest list with no cap whose sales have closed.
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
    description: ['A handful of tickets.'],
    coverTone: 'music',
    organizerId: 'org_amani',
    status: 'live',
    checkinCode: 'tiny-0123456789ab',
  });
  await database.db.insert(tiers).values([
    {
      id: 'tier_tiny_paid',
      eventId: 'evt_tiny',
      position: 1,
      name: 'Entry',
      priceMinor: 50000,
      quantity: 3,
    },
    {
      id: 'tier_tiny_guest',
      eventId: 'evt_tiny',
      position: 2,
      name: 'Guest list',
      priceMinor: 0,
      saleEndsAt: new Date('2026-09-01T00:00:00+03:00'),
    },
  ]);
});

afterAll(() => database.close());

beforeEach(() => {
  emails = [];
});

const api = () =>
  createApp({
    db: database.db,
    mailer: async (email) => void emails.push(email),
    payments: simulatedPayments,
    signingKey: keys.privateKey,
    verifyKey: { kty: 'OKP', crv: 'Ed25519', x: 'unused-here' },
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

const tokens = new Map<string, string>();
async function signIn(email: string): Promise<string> {
  const known = tokens.get(email);
  if (known) return known;
  clock += MINUTE;
  expect((await send('/auth/start', undefined, { email })).status).toBe(200);
  const code = /^(\d{6}) /.exec(emails.at(-1)!.subject)![1]!;
  const res = await send('/auth/verify', undefined, { email, code });
  const { token } = sessionSchema.parse(await res.json());
  cookies.set(token, res.headers.get('Set-Cookie')!.split(';')[0]!);
  tokens.set(email, token);
  emails = [];
  return token;
}

const organizer = () => signIn('organizer@eventify.test'); // Amani

const comp = (over: Partial<CompRequest> = {}): CompRequest => ({
  tierId: 'tier_tiny_paid',
  quantity: 2,
  name: 'Wanjiru Kamau',
  email: 'Wanjiru@Example.com',
  ...over,
});

describe('complimentary tickets', () => {
  it('issues real tickets at no charge and emails them like a purchase', async () => {
    const token = await organizer();
    const res = await send('/organizer/events/evt_tiny/comps', token, comp());
    expect(res.status).toBe(201);
    const list = compListSchema.parse(await res.json());
    expect(list.comps).toEqual([
      expect.objectContaining({
        name: 'Wanjiru Kamau',
        email: 'Wanjiru@Example.com',
        tierName: 'Entry',
        quantity: 2,
        emailed: true,
      }),
    ]);
    expect(list.tiers).toEqual([
      { id: 'tier_tiny_paid', name: 'Entry', remaining: 1 },
      { id: 'tier_tiny_guest', name: 'Guest list', remaining: null },
    ]);

    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({
      to: 'Wanjiru@Example.com',
      subject: 'Amani Wanjiru sent you tickets for Tiny Gig',
    });
    expect(emails[0]!.text).toContain('Complimentary tickets from Amani Wanjiru');
    const passes = [...emails[0]!.text.matchAll(/\/t\/([\w-]+)/g)].map((m) => m[1]!);
    expect(passes).toHaveLength(2);

    // The guest finds them under their email, and the door has them on its list.
    const guest = await signIn('wanjiru@example.com');
    const mine = await get('/me/tickets', ticketsResultSchema, guest);
    expect(mine.tickets.map((t) => t.id).sort()).toEqual([...passes].sort());
    expect(mine.tickets[0]).toMatchObject({ holderName: 'Wanjiru Kamau', tierName: 'Entry' });
    const door = (await (await send('/checkin/tiny-0123456789ab')).json()) as {
      guests: { name: string }[];
    };
    expect(door.guests.filter((g) => g.name === 'Wanjiru Kamau')).toHaveLength(2);
  });

  it('fills capacity but stays out of sales and money', async () => {
    const token = await organizer();
    const dash = await get('/organizer/events/evt_tiny/dashboard', eventDashboardSchema, token);
    expect(dash).toMatchObject({
      ticketsSold: 0,
      grossMinor: 0,
      compsIssued: 2,
      capacity: 3,
      tierSales: [
        { name: 'Entry', sold: 0, revenueMinor: 0 },
        { name: 'Guest list', sold: 0, revenueMinor: 0 },
      ],
    });
    expect(dash.dailySales.every((n) => n === 0)).toBe(true);
    const home = await get('/organizer/me', organizerHomeSchema, token);
    expect(home.events.find((e) => e.id === 'evt_tiny')!.ticketsSold).toBe(0);

    // One place is left, for comps and buyers alike.
    const more = await send('/organizer/events/evt_tiny/comps', token, comp({ quantity: 2 }));
    expect(more.status).toBe(409);
    expect(await more.json()).toMatchObject({
      error: 'not_enough_tickets',
      message: 'Only 1 Entry ticket is left.',
    });
    const [tier] = await database.db.select().from(tiers).where(eq(tiers.id, 'tier_tiny_paid'));
    expect(tier!.sold).toBe(2);
  });

  it('can add guests after sales close, but not after the event', async () => {
    const token = await organizer();
    const guestList = comp({
      tierId: 'tier_tiny_guest',
      quantity: 1,
      name: 'Press Desk',
      email: 'press@example.com',
      phone: '+254700111222',
    });
    expect((await send('/organizer/events/evt_tiny/comps', token, guestList)).status).toBe(201);
    // With a phone number the door can find them by it.
    const door = (await (await send('/checkin/tiny-0123456789ab')).json()) as {
      guests: { name: string; phone: string }[];
    };
    expect(door.guests.find((g) => g.name === 'Press Desk')!.phone).toBe('+254700111222');
    const badPhone = await send(
      '/organizer/events/evt_tiny/comps',
      token,
      comp({ quantity: 1, phone: '0712' }),
    );
    expect(badPhone.status).toBe(400);
    expect(await badPhone.json()).toMatchObject({ message: 'Enter a valid phone number' });

    const endsAt = new Date('2026-11-01T23:00:00+03:00');
    await database.db
      .update(events)
      .set({ endsAt: new Date(clock - MINUTE) })
      .where(eq(events.id, 'evt_tiny'));
    const late = await send('/organizer/events/evt_tiny/comps', token, guestList);
    expect(late.status).toBe(409);
    expect(await late.json()).toMatchObject({ error: 'event_ended' });
    await database.db.update(events).set({ endsAt }).where(eq(events.id, 'evt_tiny'));
  });

  it('is for the event’s own organizer, in good standing, with a name and email', async () => {
    const token = await organizer();
    expect((await send('/organizer/events/evt_tiny/comps', undefined, comp())).status).toBe(401);
    expect((await send('/organizer/events/evt_hack/comps', token, comp())).status).toBe(404);
    expect((await send('/organizer/events/evt_hack/comps', token)).status).toBe(404);

    const bad = await send('/organizer/events/evt_tiny/comps', token, comp({ email: 'nope' }));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ message: 'Enter a valid email' });
    const tooMany = await send('/organizer/events/evt_tiny/comps', token, comp({ quantity: 21 }));
    expect(tooMany.status).toBe(400);

    await database.db
      .update(organizers)
      .set({ status: 'suspended' })
      .where(eq(organizers.id, 'org_amani'));
    const suspended = await send('/organizer/events/evt_tiny/comps', token, comp({ quantity: 1 }));
    expect(suspended.status).toBe(403);
    expect(await suspended.json()).toMatchObject({ error: 'organizer_not_approved' });
    // They can still see what they gave away.
    const list = await get('/organizer/events/evt_tiny/comps', compListSchema, token);
    expect(list.comps.map((c) => c.email)).toEqual(['press@example.com', 'Wanjiru@Example.com']);
    await database.db
      .update(organizers)
      .set({ status: 'active' })
      .where(eq(organizers.id, 'org_amani'));
  });

  it('lists everyone with a ticket for the organizer’s spreadsheet and door sheet', async () => {
    const token = await organizer();
    const list = await get('/organizer/events/evt_tiny/attendees', attendeeListSchema, token);
    expect(list.event).toMatchObject({ id: 'evt_tiny', title: 'Tiny Gig', venue: 'A Small Room' });
    expect(list.attendees.map((a) => [a.name, a.tierName, a.kind, a.phone])).toEqual([
      ['Press Desk', 'Guest list', 'comp', '+254700111222'],
      ['Wanjiru Kamau', 'Entry', 'comp', ''],
      ['Wanjiru Kamau', 'Entry', 'comp', ''],
    ]);
    expect(list.attendees[1]).toMatchObject({ email: 'Wanjiru@Example.com', checkedInAt: null });

    expect((await send('/organizer/events/evt_tiny/attendees')).status).toBe(401);
    expect((await send('/organizer/events/evt_hack/attendees', token)).status).toBe(404);
  });
});
