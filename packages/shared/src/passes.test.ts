import { describe, expect, it } from 'vitest';
import { randomToken, signTicketQr, verifyTicketQr } from './passes';

describe('signed ticket QR', () => {
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
