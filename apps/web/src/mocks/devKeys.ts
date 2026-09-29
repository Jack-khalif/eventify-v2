/**
 * DEVELOPMENT ONLY. Ed25519 key pair the mock API uses to sign backup QR codes.
 * Published in this repo, so it proves nothing: the real backend loads its own key from an
 * environment variable (Phase B/E) and this file must never be used outside the mock API.
 */
export const DEV_QR_PRIVATE_KEY: JsonWebKey = {
  kty: 'OKP',
  crv: 'Ed25519',
  d: 'iIQYZlcLvkkjpS7vz5hC5en6AhUT42PuEl-WzFQDufw',
  x: 'S7uFdm0XdFmTMr_sDdBrIYy_r_YK4BCgIMc8_KZLxZA',
};

export const DEV_QR_PUBLIC_KEY: JsonWebKey = {
  kty: 'OKP',
  crv: 'Ed25519',
  x: 'S7uFdm0XdFmTMr_sDdBrIYy_r_YK4BCgIMc8_KZLxZA',
};
