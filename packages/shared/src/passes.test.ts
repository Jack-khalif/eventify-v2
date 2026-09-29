import { describe, expect, it } from 'vitest';
import {
  generatePassSecret,
  LIVE_CODE_ALPHABET,
  LIVE_CODE_STEP_MS,
  liveCode,
  randomToken,
  signTicketQr,
  verifyLiveCode,
  verifyTicketQr,
} from './passes';

const secret = 'q6X0mA3rWJv8Qy2uP5e9Lk1nT4cB7hD0gF2sZ8xR6wE';
const t0 = Date.parse('2026-10-02T19:00:00+03:00');

describe('live codes', () => {
  it('are 6 characters from the unambiguous alphabet', async () => {
    const code = await liveCode(secret, t0);
    expect(code).toMatch(new RegExp(`^[${LIVE_CODE_ALPHABET}]{6}$`));
    expect(code).not.toMatch(/[IO01]/);
  });

  it('stay the same within a 4-second window and change after it', async () => {
    const step = Math.floor(t0 / LIVE_CODE_STEP_MS) * LIVE_CODE_STEP_MS;
    expect(await liveCode(secret, step)).toBe(await liveCode(secret, step + 3_999));
    expect(await liveCode(secret, step)).not.toBe(await liveCode(secret, step + 4_000));
  });

  it('differ between tickets', async () => {
    expect(await liveCode(secret, t0)).not.toBe(await liveCode(generatePassSecret(), t0));
  });

  it('verify within ±8 seconds of clock difference, case-insensitively', async () => {
    const code = await liveCode(secret, t0);
    expect(await verifyLiveCode(secret, code, t0)).toBe(true);
    expect(await verifyLiveCode(secret, code.toLowerCase(), t0 + 8_000)).toBe(true);
    expect(await verifyLiveCode(secret, code, t0 - 8_000)).toBe(true);
  });

  it('reject an old screenshot', async () => {
    const code = await liveCode(secret, t0);
    expect(await verifyLiveCode(secret, code, t0 + 20_000)).toBe(false);
  });
});

describe('backup QR', () => {
  const keys = crypto.subtle.generateKey({ name: 'Ed25519' }, false, [
    'sign',
    'verify',
  ]) as Promise<CryptoKeyPair>;

  it('round-trips a genuine ticket', async () => {
    const { privateKey, publicKey } = await keys;
    const qr = await signTicketQr(privateKey, 'tkt_abc');
    expect(qr).toMatch(/^EVT1\.tkt_abc\.[\w-]+$/);
    expect(await verifyTicketQr(publicKey, qr)).toBe('tkt_abc');
  });

  it('rejects a QR edited to point at another ticket', async () => {
    const { privateKey, publicKey } = await keys;
    const qr = await signTicketQr(privateKey, 'tkt_abc');
    expect(await verifyTicketQr(publicKey, qr.replace('tkt_abc', 'tkt_xyz'))).toBeNull();
  });

  it('rejects QRs signed by someone else, and junk', async () => {
    const { publicKey } = await keys;
    const other = (await crypto.subtle.generateKey({ name: 'Ed25519' }, false, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    expect(
      await verifyTicketQr(publicKey, await signTicketQr(other.privateKey, 'tkt_abc')),
    ).toBeNull();
    expect(await verifyTicketQr(publicKey, 'https://example.com')).toBeNull();
    expect(await verifyTicketQr(publicKey, 'EVT1.tkt_abc.not-base64!!')).toBeNull();
  });
});

describe('randomToken', () => {
  it('is URL-safe and unique', () => {
    const a = randomToken();
    expect(a).toMatch(/^[\w-]{22}$/);
    expect(randomToken()).not.toBe(a);
  });
});
