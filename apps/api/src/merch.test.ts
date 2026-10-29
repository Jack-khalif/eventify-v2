import {
  adminMerchRowSchema,
  merchListSchema,
  publicEventSchema,
  sessionSchema,
  type MerchRequest,
} from '@eventify/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from './app';
import { openLocalDatabase, type Database } from './db/client';
import { seedSamples } from './db/samples';
import { auditLog } from './db/schema';
import type { Email } from './email/mailer';
import { simulatedPayments } from './payments';

/** Organizers ordering branded print, and the admin portal's print queue. */

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
    superAdminEmails: ['boss@example.com'],
    now: () => clock,
  });

const cookies = new Map<string, string>();
const send = (path: string, token?: string, body?: unknown, method?: string) =>
  api().request(`/api${path}`, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
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
const agent = () => signIn('agent@eventify.test');
const admin = () => signIn('admin@eventify.test');

const order = (over: Partial<MerchRequest> = {}): MerchRequest => ({
  items: [
    { item: 'wristband', quantity: 500 },
    { item: 'banner', quantity: 2 },
  ],
  brandingNotes: 'Logo from the poster, black on teal. Banners 3m × 1m for the stage.',
  ...over,
});

describe('merch requests', () => {
  it('puts a request in the print queue, tells the team, and shows the organizer each step', async () => {
    const token = await organizer();
    const res = await send('/organizer/events/evt_sauti/merch', token, order());
    expect(res.status).toBe(201);
    const { requests } = merchListSchema.parse(await res.json());
    expect(requests).toEqual([
      expect.objectContaining({ status: 'received', opsNote: '', items: order().items }),
    ]);

    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({
      to: 'support@eventifyafrica.co.ke',
      subject: 'Merch request: Amani Wanjiru · Sauti Sessions: Afro-house Listening Night',
    });
    expect(emails[0]!.text).toContain('500 × Wristbands');
    expect(emails[0]!.text).toContain('https://tickets.test/admin/merch');

    const queue = await get('/admin/merch', z.array(adminMerchRowSchema), await admin());
    expect(queue[0]).toMatchObject({
      id: requests[0]!.id,
      status: 'received',
      organizer: {
        name: 'Amani Wanjiru',
        handle: 'amaniwanjiru',
        email: 'organizer@eventify.test',
      },
      event: { id: 'evt_sauti' },
    });

    const boss = await admin();
    emails = [];
    const moved = await send(`/admin/merch/${requests[0]!.id}/status`, boss, {
      status: 'in_production',
      note: 'Quote sent by email: KSh 38,000. Ready Thursday.',
    });
    expect(moved.status).toBe(200);
    expect(adminMerchRowSchema.parse(await moved.json()).status).toBe('in_production');
    // Whoever asked is told, with the team's note and a way back to the dashboard.
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({
      to: 'organizer@eventify.test',
      subject: 'Merch for Sauti Sessions: Afro-house Listening Night: In production',
    });
    expect(emails[0]!.text).toContain('From Eventify: Quote sent by email: KSh 38,000.');
    expect(emails[0]!.text).toContain('https://tickets.test/organizer?event=evt_sauti');

    const seen = await get('/organizer/events/evt_sauti/merch', merchListSchema, token);
    expect(seen.requests[0]).toMatchObject({
      status: 'in_production',
      opsNote: 'Quote sent by email: KSh 38,000. Ready Thursday.',
    });

    // A status change with no note keeps the last one.
    await send(`/admin/merch/${requests[0]!.id}/status`, await admin(), {
      status: 'ready',
      note: '',
    });
    expect(emails.at(-1)!.subject).toMatch(/: Ready for pickup$/);
    const ready = await get('/organizer/events/evt_sauti/merch', merchListSchema, token);
    expect(ready.requests[0]).toMatchObject({
      status: 'ready',
      opsNote: expect.stringContaining('Quote'),
    });

    // Saving with nothing changed sends nothing.
    emails = [];
    await send(`/admin/merch/${requests[0]!.id}/status`, boss, { status: 'ready', note: '' });
    expect(emails).toHaveLength(0);

    const [audit] = await database.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.target, requests[0]!.id));
    expect(audit).toMatchObject({ action: 'merch.status', email: 'admin@eventify.test' });
  });

  it('checks the request and keeps it to the event’s own organizer', async () => {
    const token = await organizer();
    const none = await send('/organizer/events/evt_sauti/merch', token, order({ items: [] }));
    expect(none.status).toBe(400);
    expect(await none.json()).toMatchObject({ message: 'Pick at least one item' });
    const twice = await send(
      '/organizer/events/evt_sauti/merch',
      token,
      order({
        items: [
          { item: 'poster', quantity: 10 },
          { item: 'poster', quantity: 5 },
        ],
      }),
    );
    expect(twice.status).toBe(400);
    const vague = await send(
      '/organizer/events/evt_sauti/merch',
      token,
      order({ brandingNotes: 'logo' }),
    );
    expect(vague.status).toBe(400);

    expect((await send('/organizer/events/evt_hack/merch', token, order())).status).toBe(404);
    expect((await send('/organizer/events/evt_hack/merch', token)).status).toBe(404);
    expect((await send('/organizer/events/evt_sauti/merch', undefined, order())).status).toBe(401);
  });

  it('is a Super Admin’s queue', async () => {
    expect((await send('/admin/merch', await agent())).status).toBe(403);
    expect(
      (await send('/admin/merch/mer_nope/status', await agent(), { status: 'ready', note: '' }))
        .status,
    ).toBe(403);
    expect(
      (await send('/admin/merch/mer_nope/status', await admin(), { status: 'ready', note: '' }))
        .status,
    ).toBe(404);
    expect(
      (await send('/admin/merch/mer_nope/status', await admin(), { status: 'lost', note: '' }))
        .status,
    ).toBe(400);
  });

  it('goes with an event that is taken down', async () => {
    const token = await organizer();
    const created = await send('/organizer/events', token, {
      title: 'Clay Day',
      category: 'Workshops',
      city: 'Nairobi',
      venue: 'Karen Village',
      startsAt: '2026-11-07T10:00:00+03:00',
      endsAt: '2026-11-07T13:00:00+03:00',
      description: ['Bring an apron.'],
      coverImageUrl: null,
      tiers: [
        {
          name: 'Regular',
          note: '',
          priceMinor: 0,
          quantity: 12,
          saleStartsAt: null,
          saleEndsAt: null,
        },
      ],
    });
    expect(created.status).toBe(201);
    const event = publicEventSchema.parse(await created.json());
    expect((await send(`/organizer/events/${event.id}/merch`, token, order())).status).toBe(201);
    expect((await send(`/organizer/events/${event.id}`, token, undefined, 'DELETE')).status).toBe(
      204,
    );
    const queue = await get('/admin/merch', z.array(adminMerchRowSchema), await admin());
    expect(queue.some((r) => r.event.id === event.id)).toBe(false);
  });
});
