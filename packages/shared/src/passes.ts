/**
 * Signed ticket QR codes, shared by the server, ticket pages and offline door scanner.
 * "EVT1.<ticketId>.<signature>" is signed by the server with Ed25519. Door devices verify it
 * offline with the public key, so a made-up QR is rejected.
 */

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

// ── Signed QR (Ed25519) ─────────────────────────────────────────────────────

export const QR_PREFIX = 'EVT1';

export const importSigningKey = (jwk: JsonWebKey) =>
  crypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, false, ['sign']);

export const importVerifyKey = (jwk: JsonWebKey) =>
  crypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, false, ['verify']);

/** Server side: the text encoded in a ticket QR. */
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
