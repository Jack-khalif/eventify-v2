/** `npm run keygen`: print a new Ed25519 private key (JWK) for the QR_PRIVATE_KEY setting. */
const pair = (await crypto.subtle.generateKey('Ed25519', true, [
  'sign',
  'verify',
])) as CryptoKeyPair;
const { kty, crv, d, x } = await crypto.subtle.exportKey('jwk', pair.privateKey);
console.log(JSON.stringify({ kty, crv, d, x }));
