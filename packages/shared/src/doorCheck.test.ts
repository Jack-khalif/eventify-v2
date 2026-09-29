import { beforeAll, describe, expect, it } from 'vitest';
import { formatAgo } from './dates';
import { applyCheckIn, checkLiveCode, checkQr, normalizeLiveCode, searchGuests } from './doorCheck';
import { generatePassSecret, liveCode, signTicketQr } from './passes';
import type { DoorGuest } from './schemas';

const t0 = Date.parse('2026-10-02T19:30:00+03:00');

const guest = (ticketId: string, name: string, phone: string, patch: Partial<DoorGuest> = {}) => ({
  ticketId,
  code: `EVT-SAUTI-${ticketId.slice(-4)}`,
  name,
  phone,
  tierName: 'Regular',
  checkedInAt: null,
  checkedInDoor: null,
  passSecret: generatePassSecret(),
  ...patch,
});

const guests: DoorGuest[] = [
  guest('tkt_0412', 'Amina Otieno', '+254712345678'),
  guest('tkt_0087', 'Brian Momanyi', '+254733221009', {
    checkedInAt: '2026-10-02T19:24:00+03:00',
    checkedInDoor: 'Main Gate',
  }),
  guest('tkt_0533', 'Nyandeng Deng', '+211922456781'),
];

let keys: CryptoKeyPair;
beforeAll(async () => {
  keys = (await crypto.subtle.generateKey({ name: 'Ed25519' }, false, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
});

describe('checkQr', () => {
  it('admits a genuine ticket on the list', async () => {
    const qr = await signTicketQr(keys.privateKey, 'tkt_0412');
    expect(await checkQr(qr, guests, keys.publicKey)).toMatchObject({
      kind: 'valid',
      guest: { name: 'Amina Otieno' },
    });
  });

  it('flags a ticket that was already used', async () => {
    const qr = await signTicketQr(keys.privateKey, 'tkt_0087');
    expect(await checkQr(qr, guests, keys.publicKey)).toMatchObject({ kind: 'used' });
  });

  it('rejects forged QRs and genuine tickets for other events', async () => {
    const forged = (await signTicketQr(keys.privateKey, 'tkt_0412')).replace('0412', '0533');
    expect(await checkQr(forged, guests, keys.publicKey)).toEqual({
      kind: 'invalid',
      reason: 'not_a_ticket',
    });
    expect(await checkQr('https://example.com', guests, keys.publicKey)).toEqual({
      kind: 'invalid',
      reason: 'not_a_ticket',
    });
    const elsewhere = await signTicketQr(keys.privateKey, 'tkt_other');
    expect(await checkQr(elsewhere, guests, keys.publicKey)).toEqual({
      kind: 'invalid',
      reason: 'other_event',
    });
  });
});

describe('checkLiveCode', () => {
  it('finds the guest whose pass shows the code, allowing for a few seconds of clock drift', async () => {
    const code = await liveCode(guests[2]!.passSecret, t0);
    expect(await checkLiveCode(code.toLowerCase(), guests, t0 + 6_000)).toMatchObject({
      kind: 'valid',
      guest: { name: 'Nyandeng Deng' },
    });
  });

  it('rejects an old code and anything that is not a code', async () => {
    const old = await liveCode(guests[0]!.passSecret, t0 - 60_000);
    expect(await checkLiveCode(old, guests, t0)).toEqual({ kind: 'invalid', reason: 'wrong_code' });
    expect(await checkLiveCode('HELLO', guests, t0)).toEqual({
      kind: 'invalid',
      reason: 'wrong_code',
    });
  });

  it('normalizes what staff type', () => {
    expect(normalizeLiveCode(' abc 234 ')).toBe('ABC234');
  });
});

describe('searchGuests', () => {
  it('matches name, local phone format and ticket code, unchecked guests first', () => {
    expect(searchGuests(guests, 'amina').map((g) => g.name)).toEqual(['Amina Otieno']);
    expect(searchGuests(guests, '0712 345').map((g) => g.name)).toEqual(['Amina Otieno']);
    expect(searchGuests(guests, 'evt-sauti-0533').map((g) => g.name)).toEqual(['Nyandeng Deng']);
    expect(searchGuests(guests, '').map((g) => g.name)).toEqual([
      'Amina Otieno',
      'Nyandeng Deng',
      'Brian Momanyi',
    ]);
  });
});

describe('applyCheckIn', () => {
  it('keeps the earliest check-in', () => {
    const later = applyCheckIn(guests, 'tkt_0087', '2026-10-02T20:00:00+03:00', 'Side Gate');
    expect(later[1]).toMatchObject({ checkedInDoor: 'Main Gate' });
    const earlier = applyCheckIn(guests, 'tkt_0087', '2026-10-02T19:00:00+03:00', 'Side Gate');
    expect(earlier[1]).toMatchObject({ checkedInDoor: 'Side Gate' });
    const fresh = applyCheckIn(guests, 'tkt_0412', '2026-10-02T19:31:00+03:00', 'Side Gate');
    expect(fresh[0]).toMatchObject({ checkedInAt: '2026-10-02T19:31:00+03:00' });
  });
});

describe('formatAgo', () => {
  const now = new Date('2026-10-02T19:30:00+03:00');
  it('reads naturally', () => {
    expect(formatAgo('2026-10-02T19:29:40+03:00', now)).toBe('just now');
    expect(formatAgo('2026-10-02T19:24:00+03:00', now)).toBe('6 minutes ago');
    expect(formatAgo('2026-10-02T17:00:00+03:00', now)).toBe('2 hours ago');
  });
});
