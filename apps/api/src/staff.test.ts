import {
  adminAgentRowSchema,
  adminMeSchema,
  adminOrganizerDetailSchema,
  adminOrganizerRowSchema,
  sessionSchema,
  signInResultSchema,
  staffRowSchema,
  totpSetupSchema,
  totpStatusSchema,
} from '@eventify/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from './app';
import { openLocalDatabase, type Database } from './db/client';
import { seedSamples } from './db/samples';
import type { Email } from './email/mailer';
import { totpCode, totpStep } from './totp';

/** Two-step sign-in and managing who is staff. */

const START = Date.parse('2026-10-01T12:00:00+03:00');
const MINUTE = 60_000;

let database: Database;
let keys: CryptoKeyPair;
let clock = START;
let emails: Email[] = [];
let requireTwoStep = false;

beforeAll(async () => {
  database = openLocalDatabase();
  await database.migrate();
  await seedSamples(database.db);
  keys = (await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as CryptoKeyPair;
});
afterAll(() => database.close());
beforeEach(() => {
  emails = [];
  requireTwoStep = false;
});

const api = () =>
  createApp({
    db: database.db,
    mailer: async (email) => void emails.push(email),
    payments: null,
    sms: null,
    signingKey: keys.privateKey,
    verifyKey: { kty: 'OKP', crv: 'Ed25519', x: 'unused-here' },
    siteUrl: 'https://tickets.test',
    superAdminEmails: ['boss@example.com'],
    requireTwoStep,
    now: () => clock,
  });

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

async function get<T>(path: string, schema: z.ZodType<T>, who?: Who): Promise<T> {
  const res = await send(path, who);
  expect(res.status, `GET ${path}`).toBe(200);
  return schema.parse(await res.json());
}

const errorOf = async (res: Response) => ({
  status: res.status,
  error: ((await res.json()) as { error: string }).error,
});

const opened = async (res: Response): Promise<Who> => ({
  token: sessionSchema.parse(await res.json()).token,
  cookie: res.headers.get('Set-Cookie')!.split(';')[0]!,
});

/** The first step of signing in: the emailed code. */
async function emailStep(email: string) {
  clock += MINUTE; // past the "wait before asking again" limit
  await send('/auth/start', undefined, { email });
  const code = /^(\d{6}) /.exec(emails.at(-1)!.subject)![1]!;
  return send('/auth/verify', undefined, { email, code });
}

const signIn = async (email: string) => opened(await emailStep(email));
const appCode = (secret: string) => totpCode(secret, totpStep(clock));

describe('two-step sign-in', () => {
  let secret: string;

  it('is turned on by scanning a QR and proving the app shows the right code', async () => {
    const boss = await signIn('boss@example.com');
    expect(await get('/auth/totp', totpStatusSchema, boss)).toEqual({ enabled: false });
    expect((await send('/auth/totp/setup', undefined, {})).status).toBe(401);

    const setup = totpSetupSchema.parse(await (await send('/auth/totp/setup', boss, {})).json());
    secret = setup.secret;
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);

    // Nothing changes until a code from the app is confirmed.
    expect(await get('/auth/totp', totpStatusSchema, boss)).toEqual({ enabled: false });
    expect(await errorOf(await send('/auth/totp/enable', boss, { code: '000000' }))).toEqual({
      status: 422,
      error: 'invalid_code',
    });
    const res = await send('/auth/totp/enable', boss, { code: appCode(secret) });
    expect(await res.json()).toEqual({ enabled: true });
    expect(await get('/auth/totp', totpStatusSchema, boss)).toEqual({ enabled: true });
    expect((await send('/auth/totp/setup', boss, {})).status).toBe(409);
  });

  it('then asks for the app’s code after the emailed one, and takes each code once', async () => {
    const usedToEnable = appCode(secret);
    const res = await emailStep('boss@example.com');
    expect(res.headers.get('Set-Cookie')).toBeNull();
    const step = signInResultSchema.parse(await res.json());
    if (!('totpRequired' in step)) throw new Error('expected a challenge');
    const { challenge } = step;

    // The challenge is not a session, and neither a wrong code nor a used one completes it.
    expect(
      (await send('/auth/me', { token: challenge, cookie: `eventify_session=${challenge}` }))
        .status,
    ).toBe(401);
    expect((await send('/auth/totp', undefined, { challenge, code: '000000' })).status).toBe(422);
    clock += 20_000; // still within reach of the code that turned it on
    expect((await send('/auth/totp', undefined, { challenge, code: usedToEnable })).status).toBe(
      422,
    );

    clock += MINUTE;
    const done = await send('/auth/totp', undefined, { challenge, code: appCode(secret) });
    expect(done.status).toBe(200);
    const boss = await opened(done);
    expect((await get('/admin/me', adminMeSchema, boss)).role).toBe('super_admin');
    // The challenge is spent.
    clock += MINUTE;
    expect((await send('/auth/totp', undefined, { challenge, code: appCode(secret) })).status).toBe(
      422,
    );
  });

  it('drops the sign-in after five wrong app codes', async () => {
    const step = signInResultSchema.parse(await (await emailStep('boss@example.com')).json());
    if (!('totpRequired' in step)) throw new Error('expected a challenge');
    for (let n = 0; n < 5; n++) {
      expect((await send('/auth/totp', undefined, { ...step, code: '000000' })).status).toBe(422);
    }
    clock += MINUTE;
    const late = await send('/auth/totp', undefined, { ...step, code: appCode(secret) });
    expect(late.status).toBe(422);
  });

  it('must be on before a Super Admin can change anything, when the server says so', async () => {
    requireTwoStep = true;
    const naomi = await signIn('admin@eventify.test'); // a Super Admin without it
    expect((await send('/admin/organizers', naomi)).status).toBe(200); // looking is allowed
    const refused = await send('/admin/organizers/mizizi/status', naomi, { status: 'active' });
    expect(await errorOf(refused)).toEqual({ status: 403, error: 'two_step_required' });

    const setup = totpSetupSchema.parse(await (await send('/auth/totp/setup', naomi, {})).json());
    await send('/auth/totp/enable', naomi, { code: appCode(setup.secret) });
    expect(
      (await send('/admin/organizers/mizizi/status', naomi, { status: 'active' })).status,
    ).toBe(200);

    // Turning it off needs a fresh code too, so a borrowed laptop isn't enough.
    expect((await send('/auth/totp/disable', naomi, { code: '000000' })).status).toBe(422);
    clock += MINUTE;
    const off = await send('/auth/totp/disable', naomi, { code: appCode(setup.secret) });
    expect(await off.json()).toEqual({ enabled: false });
  });
});

describe('managing staff', () => {
  const staff = (who: Who) => get('/admin/staff', z.array(staffRowSchema), who);
  let naomi: Who;

  it('lists who has access, for Super Admins only', async () => {
    naomi = await signIn('admin@eventify.test');
    const rows = await staff(naomi);
    expect(rows.map((s) => [s.email, s.role, s.twoStep])).toEqual([
      ['agent@eventify.test', 'agent', false],
      ['admin@eventify.test', 'super_admin', false],
      ['boss@example.com', 'super_admin', true],
    ]);
    expect(rows[0]!.organizers).toBeGreaterThan(0);
    expect((await send('/admin/staff', await signIn('agent@eventify.test'))).status).toBe(403);
  });

  it('adds an agent, who can sign in and is given organizers to look after', async () => {
    const add = (body: object) => send('/admin/staff', naomi, body);
    expect((await add({ email: 'not-an-email', name: 'X Y', role: 'agent' })).status).toBe(400);
    expect(
      await errorOf(await add({ email: 'organizer@eventify.test', name: 'Amani', role: 'agent' })),
    ).toEqual({ status: 409, error: 'is_organizer' });

    const res = await add({ email: ' Mary@Example.com ', name: 'Mary Wambui', role: 'agent' });
    expect(res.status).toBe(201);
    const mary = staffRowSchema.parse(await res.json());
    expect(mary).toMatchObject({ email: 'mary@example.com', role: 'agent', organizers: 0 });
    expect(
      await errorOf(await add({ email: 'mary@example.com', name: 'Mary', role: 'super_admin' })),
    ).toEqual({ status: 409, error: 'already_staff' });

    const session = await signIn('mary@example.com');
    const me = await get('/admin/me', adminMeSchema, session);
    expect(me).toMatchObject({ role: 'agent', name: 'Mary Wambui' });
    expect(await get('/admin/organizers', z.array(adminOrganizerRowSchema), session)).toEqual([]);

    // Arboretum Jazz has nobody looking after it.
    const assign = (agentId: string | null) =>
      send('/admin/organizers/arboretumjazz/agent', naomi, { agentId });
    expect((await assign('agent_nobody')).status).toBe(422);
    expect(
      (await send('/admin/organizers/arboretumjazz/agent', session, { agentId: me.agentId }))
        .status,
    ).toBe(403);
    const detail = adminOrganizerDetailSchema.parse(await (await assign(me.agentId)).json());
    expect(detail.agent).toEqual({ id: me.agentId, name: 'Mary Wambui' });
    const hers = await get('/admin/organizers', z.array(adminOrganizerRowSchema), session);
    expect(hers.map((o) => o.handle)).toEqual(['arboretumjazz']);
    const agents = await get('/admin/agents', z.array(adminAgentRowSchema), naomi);
    expect(agents.find((a) => a.id === me.agentId)!.organizers).toBe(1);
  });

  it('takes access away at once, and never from yourself or a Super Admin set on the server', async () => {
    const rows = await staff(naomi);
    const idOf = (email: string) => rows.find((s) => s.email === email)!.id;
    const remove = (email: string) => send(`/admin/staff/${idOf(email)}/remove`, naomi, {});
    const mary = await signIn('mary@example.com');

    expect(await errorOf(await remove('admin@eventify.test'))).toEqual({
      status: 409,
      error: 'is_you',
    });
    expect(await errorOf(await remove('boss@example.com'))).toEqual({
      status: 409,
      error: 'in_settings',
    });
    expect((await send('/admin/staff/acc_amani/remove', naomi, {})).status).toBe(404); // not staff

    expect((await remove('mary@example.com')).status).toBe(200);
    expect((await send('/admin/me', mary)).status).toBe(401); // signed out everywhere
    expect((await staff(naomi)).some((s) => s.email === 'mary@example.com')).toBe(false);
    const jazz = await get('/admin/organizers/arboretumjazz', adminOrganizerDetailSchema, naomi);
    expect(jazz.agent).toBeNull();
    // Signing in again, she is an ordinary attendee.
    expect((await send('/admin/me', await signIn('mary@example.com'))).status).toBe(403);
  });
});
