import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Passwords are kept as scrypt hashes, each with its own salt, so a copy of the accounts table
 * can't be used to sign in. The cost settings are stored with the hash, so they can be raised
 * later without breaking the ones already saved.
 */
const COST = { logN: 15, r: 8, p: 3 };
const KEY_BYTES = 32;

function derive(password: string, salt: Buffer, cost: typeof COST): Promise<Buffer> {
  const options: ScryptOptions = {
    N: 2 ** cost.logN,
    r: cost.r,
    p: cost.p,
    maxmem: 256 * 2 ** cost.logN * cost.r,
  };
  return new Promise((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, KEY_BYTES, options, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, COST);
  return [
    'scrypt',
    COST.logN,
    COST.r,
    COST.p,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

/** Checked when there is no account, so a wrong email takes as long to refuse as a wrong password. */
const NOBODY = hashPassword(randomBytes(16).toString('hex'));

export async function verifyPassword(stored: string | null, password: string): Promise<boolean> {
  const [scheme, logN, r, p, salt, key] = (stored ?? (await NOBODY)).split('$');
  if (scheme !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64');
  const actual = await derive(password, Buffer.from(salt, 'base64'), {
    logN: Number(logN),
    r: Number(r),
    p: Number(p),
  });
  return timingSafeEqual(actual, expected) && stored !== null;
}
