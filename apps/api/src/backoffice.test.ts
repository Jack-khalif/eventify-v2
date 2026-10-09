import {
  adminAgentRowSchema,
  adminApplicationRowSchema,
  adminApprovalRowSchema,
  adminMeSchema,
  adminOrganizerDetailSchema,
  adminOrganizerRowSchema,
  adminOverviewSchema,
  adminPayoutRowSchema,
  doorListSchema,
  eventDashboardSchema,
  importVerifyKey,
  orderViewSchema,
  ORGANIZER_TERMS_VERSION,
  organizerHomeSchema,
  PRIVACY_NOTICE_VERSION,
  publicEventSchema,
  sessionSchema,
  sessionUserSchema,
  ticketLookupResultSchema,
  ticketViewSchema,
  verifyTicketQr,
  type CheckoutRequest,
  type CreateEventRequest,
} from '@eventify/shared';
import { asc } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from './app';
import { openLocalDatabase, type Database } from './db/client';
import { seedSamples } from './db/samples';
import { auditLog, consents, events, tiers } from './db/schema';
import type { Email } from './email/mailer';
import { simulatedPayments } from './payments';

/** Organizer tools, door check-in, the admin portal and "Find my tickets" by phone. */

/** Before any sample event starts, so all of them are on sale. */
const START = Date.parse('2026-10-01T12:00:00+03:00');
const MINUTE = 60_000;

let database: Database;
let keys: CryptoKeyPair;
let verifyKey: { kty: 'OKP'; crv: 'Ed25519'; x: string };
let clock = START;
let emails: Email[] = [];
let texts: { to: string; message: string }[] = [];
let smsOn = true;

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

  // A small event of Amani's with its own 3% rate, ending soon so its payout can be checked.
  await database.db.insert(events).values({
    id: 'evt_tiny',
    slug: 'tiny-gig',
    title: 'Tiny Gig',
    category: 'Music & Arts',
    city: 'Nairobi',
    currency: 'KES',
    venue: 'A Small Room',
    startsAt: new Date('2026-10-01T19:00:00+03:00'),
    endsAt: new Date('2026-10-01T23:00:00+03:00'),
    description: ['A handful of tickets.'],
    coverTone: 'music',
    organizerId: 'org_amani',
    status: 'live',
    rateBps: 300,
    checkinCode: 'tiny-0123456789ab',
  });
  await database.db.insert(tiers).values({
    id: 'tier_tiny_paid',
    eventId: 'evt_tiny',
    position: 1,
    name: 'Entry',
    priceMinor: 50000,
    quantity: 20,
  });
});

afterAll(() => database.close());

beforeEach(() => {
  emails = [];
  texts = [];
  smsOn = true;
});

const api = () =>
  createApp({
    db: database.db,
    mailer: async (email) => void emails.push(email),
    payments: simulatedPayments,
    sms: smsOn ? async (to, message) => void texts.push({ to, message }) : null,
    signingKey: keys.privateKey,
    verifyKey,
    siteUrl: 'https://tickets.test',
    superAdminEmails: ['boss@example.com'],
    now: () => clock,
  });

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
/** The cookie half of each session, by its token. */
const cookies = new Map<string, string>();

/** Sign in with the emailed code. One session per address is kept for the whole file. */
async function signIn(email: string): Promise<string> {
  const known = tokens.get(email);
  if (known) return known;
  clock += MINUTE; // past the "wait before asking again" limit
  expect((await send('/auth/start', undefined, { email })).status).toBe(200);
  const code = /^(\d{6}) /.exec(emails.at(-1)!.subject)![1]!;
  const res = await send('/auth/verify', undefined, { email, code });
  const { token } = sessionSchema.parse(await res.json());
  cookies.set(token, res.headers.get('Set-Cookie')!.split(';')[0]!);
  tokens.set(email, token);
  return token;
}

const organizer = () => signIn('organizer@eventify.test'); // Amani: active, onboarded by Grace
const agent = () => signIn('agent@eventify.test'); // Grace
const admin = () => signIn('admin@eventify.test');

/** Buy tickets and let the simulated buyer approve the M-Pesa prompt. */
async function buy(over: Partial<CheckoutRequest> = {}) {
  const res = await send('/orders', undefined, {
    eventId: 'evt_tiny',
    tierId: 'tier_tiny_paid',
    quantity: 1,
    buyer: { name: 'Amina Otieno', phone: '+254712345678', email: 'amina@example.com' },
    paymentMethod: 'mpesa',
    ...over,
  });
  expect(res.status).toBe(201);
  const order = orderViewSchema.parse(await res.json());
  clock += 5_000;
  const paid = orderViewSchema.parse(await (await send(`/orders/${order.id}`)).json());
  expect(paid.status).toBe('paid');
  return paid;
}

const application = {
  contactName: 'Wanjiku Kamau',
  organizerName: 'Tickets',
  type: 'Community group',
  city: 'Nairobi',
  category: 'Workshops',
  payoutMethod: 'mpesa',
  about: 'We run monthly pottery workshops for beginners in Karen.',
  acceptTerms: true,
  consentToDataProcessing: true,
  termsVersion: ORGANIZER_TERMS_VERSION,
  privacyVersion: PRIVACY_NOTICE_VERSION,
};

// A JPEG as far as its first bytes go, which is all the server looks at.
const POSTER = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString('base64')}`;

const newEvent = (over: Partial<CreateEventRequest> = {}): CreateEventRequest => ({
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
      priceMinor: 150000,
      quantity: 12,
      saleStartsAt: null,
      saleEndsAt: null,
    },
  ],
  ...over,
});

describe('applying to host', () => {
  it('turns an attendee into a pending organizer whose handle avoids the app’s own paths', async () => {
    expect((await send('/organizer/apply', undefined, application)).status).toBe(401);

    const token = await signIn('wanjiku@example.com');
    expect((await send('/organizer/me', token)).status).toBe(403);
    expect((await send('/organizer/apply', token, { ...application, about: 'short' })).status).toBe(
      400,
    );

    const res = await send('/organizer/apply', token, application);
    expect(res.status).toBe(201);
    const user = sessionUserSchema.parse(await res.json());
    expect(user).toMatchObject({
      name: 'Wanjiku Kamau',
      role: 'organizer',
      organizer: { name: 'Tickets', status: 'pending' },
    });
    // Plain "tickets" would have shadowed the app's own /tickets page.
    expect(user.organizer!.handle).toBe('tickets-2');

    expect((await send('/organizer/apply', token, application)).status).toBe(409);
    expect((await send('/organizers/tickets-2')).status).toBe(404); // no public page yet
  });

  it('keeps a pending organizer from publishing until a Super Admin approves', async () => {
    const token = await signIn('wanjiku@example.com');
    const refused = await send('/organizer/events', token, newEvent());
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as { error: string }).error).toBe('organizer_not_approved');

    const boss = await admin();
    const waiting = await get('/admin/applications', z.array(adminApplicationRowSchema), boss);
    expect(waiting.map((a) => a.handle)).toEqual(['mizizi', 'tickets-2']); // oldest first
    expect(waiting[1]).toMatchObject({
      contactName: 'Wanjiku Kamau',
      email: 'wanjiku@example.com',
    });

    // Agents can't decide applications, and an approved organizer can't be approved again.
    const status = { status: 'active' };
    expect((await send('/admin/organizers/tickets-2/status', await agent(), status)).status).toBe(
      403,
    );
    expect((await send('/admin/organizers/tickets-2/status', boss, status)).status).toBe(200);
    expect((await send('/admin/organizers/tickets-2/status', boss, status)).status).toBe(409);

    expect((await send('/organizer/events', token, newEvent())).status).toBe(201);
  });

  it('lets a declined organizer apply again with new details', async () => {
    const token = await signIn('second-try@example.com');
    await send('/organizer/apply', token, { ...application, organizerName: 'Kiln Club' });
    const boss = await admin();
    await send('/admin/organizers/kiln-club/status', boss, { status: 'rejected' });

    const res = await send('/organizer/apply', token, {
      ...application,
      organizerName: 'Kiln Club Nairobi',
    });
    expect(res.status).toBe(201);
    expect(sessionUserSchema.parse(await res.json()).organizer).toMatchObject({
      handle: 'kiln-club-nairobi',
      status: 'pending',
    });
    const rows = await get('/admin/organizers', z.array(adminOrganizerRowSchema), boss);
    expect(rows.filter((o) => o.name.startsWith('Kiln Club'))).toHaveLength(1);
  });

  it('needs both ticks and the current wording, and keeps a record of each acceptance', async () => {
    const token = await signIn('consent@example.com');
    const apply = (over: object) =>
      send('/organizer/apply', token, { ...application, organizerName: 'Consent Club', ...over });

    expect((await apply({ acceptTerms: false })).status).toBe(400);
    expect((await apply({ consentToDataProcessing: false })).status).toBe(400);
    const stale = await apply({ termsVersion: '2020-01-01' });
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as { error: string }).error).toBe('terms_changed');
    const recorded = async () =>
      (await database.db.select().from(consents)).filter((r) => r.email === 'consent@example.com');
    expect(await recorded()).toEqual([]);

    expect((await apply({})).status).toBe(201);
    const rows = await recorded();
    expect(rows.map((r) => [r.document, r.version]).sort()).toEqual([
      ['organizer_terms', ORGANIZER_TERMS_VERSION],
      ['privacy_notice', PRIVACY_NOTICE_VERSION],
    ]);
    expect(rows[0]!.acceptedAt.getTime()).toBe(clock);
  });
});

describe('creating events', () => {
  it('publishes an event with its poster and puts it on sale', async () => {
    const token = await organizer();
    const res = await send('/organizer/events', token, newEvent({ coverImageUrl: POSTER }));
    expect(res.status).toBe(201);
    const event = publicEventSchema.parse(await res.json());
    // The earlier test took "clay-day".
    expect(event).toMatchObject({ slug: 'clay-day-2', currency: 'KES', status: 'live' });
    expect(event.organizer.handle).toBe('amaniwanjiru');
    expect(event.tiers[0]).toMatchObject({ name: 'Regular', sold: 0, quantity: 12 });

    expect(event.coverImageUrl).toMatch(/^\/api\/images\/.{20,}$/);
    const poster = await api().request(event.coverImageUrl!);
    expect(poster.headers.get('Content-Type')).toBe('image/jpeg');
    expect(poster.headers.get('Cache-Control')).toContain('immutable');
    expect(new Uint8Array(await poster.arrayBuffer()).slice(0, 3)).toEqual(
      new Uint8Array([0xff, 0xd8, 0xff]),
    );

    const listed = await get('/events?city=Nairobi', z.array(publicEventSchema));
    expect(listed.some((e) => e.slug === 'clay-day-2')).toBe(true);
    const order = await buy({ eventId: event.id, tierId: event.tiers[0]!.id });
    expect(order.tickets[0]!.code).toMatch(/^EVT-[A-Z0-9]+-0001$/);
    expect(order.rateBps).toBe(450); // Amani's rate
  });

  it('turns away events in the past, backwards times and things that are not pictures', async () => {
    const token = await organizer();
    const tryEvent = async (over: Partial<CreateEventRequest>) => {
      const res = await send('/organizer/events', token, newEvent(over));
      return { status: res.status, error: ((await res.json()) as { error: string }).error };
    };
    expect(await tryEvent({ startsAt: '2026-09-01T10:00:00+03:00' })).toEqual({
      status: 422,
      error: 'starts_in_past',
    });
    expect(await tryEvent({ endsAt: '2026-11-07T09:00:00+03:00' })).toEqual({
      status: 422,
      error: 'ends_before_start',
    });
    const html = Buffer.from('<script>alert(1)</script>').toString('base64');
    for (const coverImageUrl of [
      `data:image/jpeg;base64,${html}`,
      `data:text/html;base64,${html}`,
      'https://elsewhere.example/tracker.gif',
    ]) {
      expect(await tryEvent({ coverImageUrl })).toEqual({ status: 422, error: 'bad_poster' });
    }
    expect((await tryEvent({ title: '' })).status).toBe(400);
  });
});

describe('the organizer dashboard', () => {
  it('lists the organizer’s own events and reports sales, views and the door link', async () => {
    const token = await organizer();
    await send('/events/tiny-gig');
    await send('/events/tiny-gig');
    await buy({ quantity: 2 });

    const home = await get('/organizer/me', organizerHomeSchema, token);
    expect(home.organizer).toMatchObject({ handle: 'amaniwanjiru', rateBps: 450 });
    expect(home.events.find((e) => e.id === 'evt_tiny')!.ticketsSold).toBe(2);
    expect(home.events.every((e) => e.id !== 'evt_hack')).toBe(true);

    const dash = await get('/organizer/events/evt_tiny/dashboard', eventDashboardSchema, token);
    expect(dash).toMatchObject({
      ticketsSold: 2,
      grossMinor: 100000,
      capacity: 20,
      rateBps: 300, // the event's own rate
      pageViews: 2,
      pageViewsThisWeek: 2,
      checkIns: 0,
      checkinCode: 'tiny-0123456789ab',
    });
    expect(dash.dailySales).toEqual([...Array<number>(13).fill(0), 2]);
  });

  it('shows nobody another organizer’s numbers', async () => {
    const token = await organizer();
    const others = await get('/events?category=Campus', z.array(publicEventSchema));
    const notMine = others.find((e) => e.organizerId !== 'org_amani')!;
    expect((await send(`/organizer/events/${notMine.id}/dashboard`, token)).status).toBe(404);
    expect((await send('/organizer/events/evt_tiny/dashboard')).status).toBe(401);
    expect((await send('/organizer/me', await admin())).status).toBe(403);
  });
});

describe('door check-in', () => {
  it('hands a door device the guest list and a key that verifies the tickets’ QR codes', async () => {
    expect((await send('/checkin/tiny-wrongwrongwr')).status).toBe(404);

    const list = await get('/checkin/tiny-0123456789ab', doorListSchema);
    expect(list.event.title).toBe('Tiny Gig');
    expect(list.guests).toHaveLength(2);
    expect(list.guests[0]).toMatchObject({
      name: 'Amina Otieno',
      phone: '+254712345678',
      tierName: 'Entry',
      checkedInAt: null,
    });

    const ticket = await get(`/tickets/${list.guests[0]!.ticketId}`, ticketViewSchema);
    expect(ticket.passSecret).toBe(list.guests[0]!.passSecret);
    const key = await importVerifyKey(list.verifyKey);
    expect(await verifyTicketQr(key, ticket.qrPayload)).toBe(ticket.id);
  });

  it('merges check-ins from several devices, keeping the earliest', async () => {
    clock = Date.parse('2026-10-01T19:35:00+03:00'); // doors are open
    const [first, second] = (await get('/checkin/tiny-0123456789ab', doorListSchema)).guests;
    const elsewhere = await buy({ eventId: 'evt_sauti', tierId: 'tier_sauti_regular' });
    const sync = async (door: string, checkIns: { ticketId: string; at: string }[]) => {
      const res = await send('/checkin/tiny-0123456789ab/sync', undefined, {
        door,
        checkIns: checkIns.map((c) => ({ ...c, offline: false })),
      });
      expect(res.status).toBe(200);
      return doorListSchema.parse(await res.json());
    };

    const afterMain = await sync('Main Gate', [
      { ticketId: first!.ticketId, at: '2026-10-01T19:10:00+03:00' },
      { ticketId: elsewhere.tickets[0]!.id, at: '2026-10-01T19:11:00+03:00' }, // another event's
    ]);
    expect(afterMain.guests).toHaveLength(2);
    expect(afterMain.guests.find((g) => g.ticketId === first!.ticketId)).toMatchObject({
      checkedInAt: '2026-10-01T19:10:00+03:00',
      checkedInDoor: 'Main Gate',
    });

    // The side gate was offline: it scanned the same ticket later, and another one earlier.
    const afterSide = await sync('Side Gate', [
      { ticketId: first!.ticketId, at: '2026-10-01T19:30:00+03:00' },
      { ticketId: second!.ticketId, at: '2026-10-01T19:05:00+03:00' },
    ]);
    expect(afterSide.doors).toEqual(['Main Gate', 'Side Gate']);
    expect(afterSide.guests.map((g) => g.checkedInDoor)).toEqual(['Main Gate', 'Side Gate']);
    // …and when the main gate later reports an even earlier scan of that one, it wins.
    const merged = await sync('Main Gate', [
      { ticketId: second!.ticketId, at: '2026-10-01T19:01:00+03:00' },
    ]);
    expect(merged.guests.find((g) => g.ticketId === second!.ticketId)).toMatchObject({
      checkedInAt: '2026-10-01T19:01:00+03:00',
      checkedInDoor: 'Main Gate',
    });

    const ticket = await get(`/tickets/${elsewhere.tickets[0]!.id}`, ticketViewSchema);
    expect(ticket.checkedInAt).toBeNull();

    const dash = await get(
      '/organizer/events/evt_tiny/dashboard',
      eventDashboardSchema,
      await organizer(),
    );
    expect(dash.checkIns).toBe(2);
    expect(dash.doors).toEqual([
      { doorId: 'door_main-gate', name: 'Main Gate', count: 2 },
      { doorId: 'door_side-gate', name: 'Side Gate', count: 0 },
    ]);
  });

  it('refuses a sync that isn’t in the expected shape', async () => {
    const res = await send('/checkin/tiny-0123456789ab/sync', undefined, { door: '' });
    expect(res.status).toBe(400);
  });
});

describe('finding tickets by phone', () => {
  it('texts a code to a number that bought, and trades it for the tickets', async () => {
    clock += MINUTE;
    // A number with no tickets hears the same answer, and gets no text.
    const nobody = await send('/ticket-lookup/start', undefined, { phone: '+254700000001' });
    expect(await nobody.json()).toEqual({ sent: true });
    expect(texts).toHaveLength(0);

    const phone = '+254712345678';
    expect((await send('/ticket-lookup/start', undefined, { phone })).status).toBe(200);
    expect(texts).toHaveLength(1);
    expect(texts[0]!.to).toBe(phone);
    const code = /^(\d{6}) /.exec(texts[0]!.message)![1]!;

    const wrong = code === '000000' ? '111111' : '000000';
    expect((await send('/ticket-lookup/verify', undefined, { phone, code: wrong })).status).toBe(
      422,
    );
    const res = await send('/ticket-lookup/verify', undefined, { phone, code });
    const { tickets } = ticketLookupResultSchema.parse(await res.json());
    expect(tickets.length).toBeGreaterThanOrEqual(4);
    expect(tickets[0]!.event.slug).toBe('tiny-gig'); // soonest event first

    // The code works once, and asking again straight away is refused.
    expect((await send('/ticket-lookup/verify', undefined, { phone, code })).status).toBe(422);
    expect((await send('/ticket-lookup/start', undefined, { phone })).status).toBe(429);
  });

  it('says so when there is no SMS account, instead of pretending to send', async () => {
    smsOn = false;
    const res = await send('/ticket-lookup/start', undefined, { phone: '+254712345678' });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe('sms_unavailable');
  });
});

describe('the admin portal', () => {
  it('is for staff only, and shows agents just the organizers they onboarded', async () => {
    expect((await send('/admin/me')).status).toBe(401);
    expect((await send('/admin/me', await organizer())).status).toBe(403);

    const grace = await agent();
    expect(await get('/admin/me', adminMeSchema, grace)).toEqual({
      role: 'agent',
      name: 'Grace Achieng',
      agentId: 'agent_grace',
    });
    const hers = await get('/admin/organizers', z.array(adminOrganizerRowSchema), grace);
    expect(hers.length).toBeGreaterThan(0);
    expect(hers.every((o) => o.agent?.id === 'agent_grace')).toBe(true);
    // Two tickets for the tiny gig, one for Sauti Sessions and one for Clay Day.
    expect(hers.find((o) => o.id === 'org_amani')!.salesMinor).toBe(100000 + 120000 + 150000);

    const all = await get('/admin/organizers', z.array(adminOrganizerRowSchema), await admin());
    expect(all.length).toBeGreaterThan(hers.length);
    const notHers = all.find((o) => o.agent?.id !== 'agent_grace')!;
    expect((await send(`/admin/organizers/${notHers.handle}`, grace)).status).toBe(403);
    for (const path of ['/admin/applications', '/admin/approvals', '/admin/agents']) {
      expect((await send(path, grace)).status, path).toBe(403);
    }
  });

  it('names a Super Admin who has never told us their name by their email', async () => {
    const me = await get('/admin/me', adminMeSchema, await signIn('boss@example.com'));
    expect(me).toEqual({ role: 'super_admin', name: 'boss@example.com', agentId: null });
  });

  it('lets an agent change a rate, which applies to the next sale only', async () => {
    const grace = await agent();
    const change = (body: object) => send('/admin/organizers/amaniwanjiru/rate', grace, body);
    const reason = 'Volume discount for a repeat host';

    expect((await change({ rateBps: 450, reason, eventId: null })).status).toBe(422); // unchanged
    expect((await change({ rateBps: 900, reason, eventId: null })).status).toBe(422); // too high
    expect((await change({ rateBps: 400, reason: 'ok', eventId: null })).status).toBe(422);
    expect((await change({ rateBps: 400, reason, eventId: 'evt_hack' })).status).toBe(422);

    const res = await change({ rateBps: 400, reason, eventId: null });
    expect(await res.json()).toEqual({ outcome: 'applied' });

    const detail = await get('/admin/organizers/amaniwanjiru', adminOrganizerDetailSchema, grace);
    expect(detail.rateBps).toBe(400);
    expect(detail.rateHistory[0]).toMatchObject({
      oldBps: 450,
      newBps: 400,
      reason,
      changedBy: 'Grace Achieng',
      eventTitle: null,
    });
    expect(detail.rateHistory).toHaveLength(2); // and the sample change before it
    expect(detail.events.find((e) => e.id === 'evt_tiny')!.rateBps).toBe(300);

    const order = await buy({ eventId: 'evt_sauti', tierId: 'tier_sauti_regular' });
    expect(order.rateBps).toBe(400);
  });

  it('sends an agent’s request below the floor to a Super Admin, who approves it once', async () => {
    const grace = await agent();
    const boss = await admin();
    const ask = (rateBps: number) =>
      send('/admin/organizers/amaniwanjiru/rate', grace, {
        rateBps,
        reason: 'First-year retention deal',
        eventId: 'evt_sauti',
      });

    expect(await (await ask(260)).json()).toEqual({ outcome: 'sent_for_approval' });
    // Asking again replaces the request still waiting.
    expect(await (await ask(250)).json()).toEqual({ outcome: 'sent_for_approval' });

    const waiting = await get('/admin/approvals', z.array(adminApprovalRowSchema), boss);
    const mine = waiting.filter((a) => a.handle === 'amaniwanjiru');
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      requestedBps: 250,
      currentBps: 400,
      agentName: 'Grace Achieng',
      eventTitle: 'Sauti Sessions: Afro-house Listening Night',
    });
    const detail = () => get('/admin/organizers/amaniwanjiru', adminOrganizerDetailSchema, boss);
    expect((await detail()).pendingApproval?.id).toBe(mine[0]!.id);

    expect((await send(`/admin/approvals/${mine[0]!.id}/approve`, grace, {})).status).toBe(403);
    expect((await send(`/admin/approvals/${mine[0]!.id}/approve`, boss, {})).status).toBe(200);
    expect((await send(`/admin/approvals/${mine[0]!.id}/reject`, boss, {})).status).toBe(409);
    expect((await send(`/admin/approvals/${mine[0]!.id}/maybe`, boss, {})).status).toBe(404);

    const after = await detail();
    expect(after.pendingApproval).toBeNull();
    expect(after.rateBps).toBe(400); // the organizer's own rate is untouched
    expect(after.events.find((e) => e.id === 'evt_sauti')!.rateBps).toBe(250);
    expect(after.rateHistory[0]).toMatchObject({
      oldBps: 400,
      newBps: 250,
      changedBy: 'Grace Achieng, approved by Naomi Kiptoo',
      eventTitle: 'Sauti Sessions: Afro-house Listening Night',
    });

    // A Super Admin needs nobody's approval; a rejected request changes nothing.
    const lens = await get('/admin/approvals', z.array(adminApprovalRowSchema), boss);
    expect(lens.map((a) => a.id)).toEqual(['ap_0']);
    expect((await send('/admin/approvals/ap_0/reject', boss, {})).status).toBe(200);
    expect(await get('/admin/approvals', z.array(adminApprovalRowSchema), boss)).toEqual([]);
  });

  it('suspends and reinstates organizers, which closes and reopens publishing', async () => {
    const boss = await admin();
    const token = await organizer();
    const move = (status: string) =>
      send('/admin/organizers/amaniwanjiru/status', boss, { status });

    expect((await move('rejected')).status).toBe(409); // not a move an active organizer can make
    const res = await move('suspended');
    expect(adminOrganizerDetailSchema.parse(await res.json()).status).toBe('suspended');
    expect((await send('/organizer/events', token, newEvent())).status).toBe(403);
    expect((await send('/organizer/me', token)).status).toBe(200); // past events stay visible

    expect((await move('active')).status).toBe(200);
    expect((await send('/admin/organizers/nobody/status', boss, { status: 'active' })).status).toBe(
      404,
    );
  });

  it('adds up the money for the overview, per currency and per day', async () => {
    // One buyer whose M-Pesa prompt fails, so the payment numbers have something to show.
    const failed = await send('/orders', undefined, {
      eventId: 'evt_tiny',
      tierId: 'tier_tiny_paid',
      quantity: 1,
      buyer: { name: 'Otieno', phone: '+254700000000', email: 'otieno@example.com' },
      paymentMethod: 'mpesa',
    });
    clock += 5_000;
    const order = orderViewSchema.parse(await failed.json());
    expect((await (await send(`/orders/${order.id}`)).json()) as object).toMatchObject({
      status: 'failed',
    });

    const boss = await admin();
    const kes = await get('/admin/overview?days=7', adminOverviewSchema, boss);
    // Tiny gig: 2 tickets at KSh 500 (3%). Sauti: KSh 1,200 at 4.5%, then KSh 1,200 at 4%.
    // Clay Day: KSh 1,500 at 4.5%.
    expect(kes.grossMinor).toBe(100000 + 240000 + 150000);
    expect(kes.feesMinor).toBe(3000 + 5400 + 4800 + 6750);
    expect(kes.dailyGrossMinor).toEqual([0, 0, 0, 0, 0, 0, kes.grossMinor]);
    expect(kes.topOrganizers).toEqual([
      { handle: 'amaniwanjiru', name: 'Amani Wanjiru', feesMinor: kes.feesMinor },
    ]);
    expect(kes.payments).toMatchObject({ attempts: 5, succeeded: 4 });
    expect(kes.payments.failures.find((f) => f.reason === 'insufficient_funds')!.count).toBe(1);
    expect(kes.liveEvents).toBeGreaterThan(5);

    const ssp = await get('/admin/overview?days=7&currency=SSP', adminOverviewSchema, boss);
    expect(ssp.grossMinor).toBe(0);
    const juba = await get('/admin/overview?city=Juba', adminOverviewSchema, boss);
    expect(juba.grossMinor).toBe(0);
    expect(juba.organizerCount).toBeLessThan(kes.organizerCount);
    expect((await send('/admin/overview?days=5', boss)).status).toBe(400);

    const peter = (await get('/admin/agents', z.array(adminAgentRowSchema), boss)).find(
      (a) => a.id === 'agent_peter',
    )!;
    expect(peter.sales.every((m) => m.amountMinor === 0)).toBe(true);
    const grace = (await get('/admin/agents', z.array(adminAgentRowSchema), boss)).find(
      (a) => a.id === 'agent_grace',
    )!;
    expect(grace.sales).toContainEqual({ currency: 'KES', amountMinor: kes.grossMinor });
    expect(grace.fees).toContainEqual({ currency: 'KES', amountMinor: kes.feesMinor });
  });

  it('owes the organizer for an event once it has ended, and records the payment once', async () => {
    const boss = await admin();
    const payouts = () => get('/admin/payouts', z.array(adminPayoutRowSchema), boss);
    expect(await payouts()).toEqual([]); // nothing has ended yet

    clock = Date.parse('2026-10-01T23:30:00+03:00'); // the tiny gig is over
    const due = await payouts();
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({
      organizerId: 'org_amani',
      handle: 'amaniwanjiru',
      amountMinor: 100000 - 3000, // two tickets less the 3% fee
      currency: 'KES',
      method: 'mpesa',
      status: 'pending',
      reference: null,
    });
    expect(await payouts()).toHaveLength(1); // looking again doesn't owe it twice

    const overview = await get('/admin/overview', adminOverviewSchema, boss);
    expect(overview.pendingPayouts).toEqual([{ currency: 'KES', amountMinor: 97000 }]);
    expect(overview.pendingPayoutCount).toBe(1);

    const pay = (token: string, reference: string) =>
      send(`/admin/payouts/${due[0]!.id}/paid`, token, { reference });
    expect((await pay(await agent(), 'SJK4H7X2QP')).status).toBe(403);
    expect((await pay(boss, 'no')).status).toBe(400);
    const paid = adminPayoutRowSchema.parse(await (await pay(boss, 'sjk4h7x2qp')).json());
    expect(paid).toMatchObject({
      status: 'paid',
      reference: 'SJK4H7X2QP',
      paidAt: '2026-10-01T23:30:00+03:00',
    });
    expect((await pay(boss, 'SJK4H7X2QP')).status).toBe(409);
    expect(
      (await send('/admin/payouts/po_nope/paid', boss, { reference: 'SJK4H7X2QP' })).status,
    ).toBe(404);

    const detail = await get('/admin/organizers/amaniwanjiru', adminOrganizerDetailSchema, boss);
    expect(detail.payout).toMatchObject({ status: 'paid', reference: 'SJK4H7X2QP' });
    expect(detail.events.find((e) => e.id === 'evt_tiny')!.status).toBe('ended');
  });

  it('keeps a record of who changed what', async () => {
    const log = await database.db.select().from(auditLog).orderBy(asc(auditLog.at));
    const of = (action: string) => log.filter((entry) => entry.action === action);

    expect(of('payout.paid')).toHaveLength(1); // the refused attempts left no entry
    expect(of('payout.paid')[0]).toMatchObject({
      email: 'admin@eventify.test',
      detail: { reference: 'SJK4H7X2QP', amountMinor: 97000, handle: 'amaniwanjiru' },
    });
    expect(of('rate.change').map((entry) => [entry.email, entry.detail.outcome])).toEqual([
      ['agent@eventify.test', 'applied'],
      ['agent@eventify.test', 'sent_for_approval'],
      ['agent@eventify.test', 'sent_for_approval'],
    ]);
    expect(of('rate.approval').map((entry) => entry.detail.decision)).toEqual([
      'approve',
      'reject',
    ]);
    expect(of('organizer.status').map((entry) => `${entry.target}:${entry.detail.status}`)).toEqual(
      ['tickets-2:active', 'kiln-club:rejected', 'amaniwanjiru:suspended', 'amaniwanjiru:active'],
    );
  });
});
