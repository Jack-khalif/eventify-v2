/**
 * Express Entry pass security, shared by the server, the Live Pass page and the offline door scanner.
 *
 * Live code: a 6-character code derived from the ticket's secret and the current 4-second window
 * (like a TOTP). It changes constantly, so a screenshot is useless within seconds, and a door device
 * holding the guest list's secrets can check it with no internet.
 *
 * Backup QR: "EVT1.<ticketId>.<signature>", signed by the server with Ed25519. Door devices verify
 * it offline with the public key, so a made-up QR is rejected. It is static, so it is the weaker
 * option and the scanner flags it when the same ticket is used twice.
 */

/** No I, O, 0 or 1, so codes can be read aloud and typed without confusion. 32 symbols = 5 bits each. */
export const LIVE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const LIVE_CODE_LENGTH = 6;
export const LIVE_CODE_STEP_MS = 4_000;
/** Steps either side of "now" a door device accepts, to allow for clocks that are a few seconds apart. */
export const LIVE_CODE_WINDOW = 2;

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const binary = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Random, URL-safe identifier; `bytes` of entropy (16 bytes = 22 characters). */
export function randomToken(bytes = 16): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** A new per-ticket secret for live codes. */
export const generatePassSecret = () => randomToken(32);

export const liveCodeStep = (now: number) => Math.floor(now / LIVE_CODE_STEP_MS);

async function codeForStep(secret: string, step: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    fromBase64Url(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const counter = new DataView(new ArrayBuffer(8));
  counter.setBigUint64(0, BigInt(step));
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, counter.buffer));
  let code = '';
  for (let i = 0; i < LIVE_CODE_LENGTH; i++) code += LIVE_CODE_ALPHABET[mac[i]! & 31];
  return code;
}

/** The code the Live Pass shows at `now`. */
export const liveCode = (secret: string, now: number = Date.now()) =>
  codeForStep(secret, liveCodeStep(now));

/** Door check: does `code` match this ticket within the allowed clock window? */
export async function verifyLiveCode(
  secret: string,
  code: string,
  now: number = Date.now(),
  window = LIVE_CODE_WINDOW,
): Promise<boolean> {
  const wanted = code.trim().toUpperCase();
  const step = liveCodeStep(now);
  for (let offset = -window; offset <= window; offset++) {
    if ((await codeForStep(secret, step + offset)) === wanted) return true;
  }
  return false;
}

// ── Backup QR (Ed25519) ─────────────────────────────────────────────────────

export const QR_PREFIX = 'EVT1';

export const importSigningKey = (jwk: JsonWebKey) =>
  crypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, false, ['sign']);

export const importVerifyKey = (jwk: JsonWebKey) =>
  crypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, false, ['verify']);

/** Server side: the text encoded in a ticket's backup QR. */
export async function signTicketQr(privateKey: CryptoKey, ticketId: string): Promise<string> {
  const sig = await crypto.subtle.sign(
    'Ed25519',
    privateKey,
    encoder.encode(`${QR_PREFIX}.${ticketId}`),
  );
  return `${QR_PREFIX}.${ticketId}.${toBase64Url(new Uint8Array(sig))}`;
}

/** Door side: the ticket id if the QR is genuine, otherwise null. */
export async function verifyTicketQr(
  publicKey: CryptoKey,
  payload: string,
): Promise<string | null> {
  const parts = payload.trim().split('.');
  if (parts.length !== 3 || parts[0] !== QR_PREFIX || !parts[1] || !parts[2]) return null;
  try {
    const ok = await crypto.subtle.verify(
      'Ed25519',
      publicKey,
      fromBase64Url(parts[2]),
      encoder.encode(`${QR_PREFIX}.${parts[1]}`),
    );
    return ok ? parts[1] : null;
  } catch {
    return null;
  }
}

/** Pass colours shift every day, so an old screenshot looks visibly wrong at the door (from the design). */
export function passHue(date: Date = new Date()): number {
  return (date.getDate() * 47) % 360;
}
