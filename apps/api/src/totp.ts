import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Time-based one-time codes as authenticator apps make them (RFC 6238: HMAC-SHA1, 30-second steps,
 * 6 digits), for the second step of a staff sign-in.
 */

const STEP_MS = 30_000;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(text: string): Buffer {
  let bits = '';
  for (const c of text.replace(/=+$/, '').toUpperCase()) {
    const value = ALPHABET.indexOf(c);
    if (value < 0) throw new Error('Not base32');
    bits += value.toString(2).padStart(5, '0');
  }
  return Buffer.from(bits.match(/.{8}/g)?.map((b) => parseInt(b, 2)) ?? []);
}

/** A new secret: 20 random bytes as the 32 base32 characters the apps expect. */
export function generateTotpSecret(): string {
  let bits = '';
  for (const byte of randomBytes(20)) bits += byte.toString(2).padStart(8, '0');
  return bits
    .match(/.{5}/g)!
    .map((b) => ALPHABET[parseInt(b, 2)])
    .join('');
}

export const totpStep = (now: number) => Math.floor(now / STEP_MS);

export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = mac[mac.length - 1]! & 0xf;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/**
 * The step this code belongs to, or null when it is wrong. The steps either side of now are
 * accepted, for phones whose clock is a little off; steps up to `lastStep` have been used already.
 */
export function matchTotp(
  secret: string,
  code: string,
  now: number,
  lastStep: number | null,
): number | null {
  const current = totpStep(now);
  for (const step of [current, current - 1, current + 1]) {
    if (lastStep !== null && step <= lastStep) continue;
    if (
      timingSafeEqual(Buffer.from(totpCode(secret, step)), Buffer.from(code.padEnd(6).slice(0, 6)))
    ) {
      return step;
    }
  }
  return null;
}

/** What the QR holds, so the app shows "Eventify (amina@example.com)". */
export const otpauthUrl = (secret: string, email: string) =>
  `otpauth://totp/${encodeURIComponent(`Eventify:${email}`)}?secret=${secret}&issuer=Eventify`;
