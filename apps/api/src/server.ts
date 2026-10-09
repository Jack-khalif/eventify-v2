import { importSigningKey } from '@eventify/shared';
import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { createApp } from './app';
import { loadConfig } from './config';
import { openDatabase } from './db/client';
import { seedSamples } from './db/samples';
import { consoleMailer, resendMailer } from './email/mailer';
import { simulatedPayments } from './payments';
import { africasTalkingSms, consoleSms } from './sms';

const config = loadConfig();
const database = openDatabase(config.databaseUrl);

if (!config.databaseUrl) {
  // The local development database looks after itself; a real one is migrated with `npm run db:migrate`.
  await database.migrate();
  if (await seedSamples(database.db)) console.log('Added the sample organizers and events.');
}

// The door scanner needs the public half of the QR key; a JWK's `x` is exactly that.
let signingKey: CryptoKey;
let publicX: string;
if (config.qrPrivateKey) {
  const jwk = JSON.parse(config.qrPrivateKey) as JsonWebKey;
  signingKey = await importSigningKey(jwk);
  publicX = jwk.x!;
} else {
  const pair = (await crypto.subtle.generateKey('Ed25519', true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  signingKey = pair.privateKey;
  publicX = (await crypto.subtle.exportKey('jwk', pair.publicKey)).x!;
}

// Without an SMS account, development prints the code here and production turns phone lookup off.
const sms = config.sms
  ? africasTalkingSms(config.sms.username, config.sms.apiKey, config.sms.senderId)
  : config.production
    ? null
    : consoleSms;

const app = createApp({
  db: database.db,
  mailer: config.resendApiKey ? resendMailer(config.resendApiKey, config.emailFrom) : consoleMailer,
  payments: config.payments === 'simulated' ? simulatedPayments : null,
  sms,
  signingKey,
  verifyKey: { kty: 'OKP', crv: 'Ed25519', x: publicX },
  siteUrl: config.siteUrl,
  superAdminEmails: config.superAdminEmails,
  requireTwoStep: config.requireTwoStep,
  clientIp: (c) => {
    // Only the last entries were written by proxies we know; anything before them is the visitor's claim.
    const forwarded =
      config.trustProxy > 0 &&
      c.req.header('X-Forwarded-For')?.split(',').at(-config.trustProxy)?.trim();
    return forwarded || getConnInfo(c).remote.address || 'unknown';
  },
});

serve({ fetch: app.fetch, port: config.port }, ({ port }) => {
  console.log(
    `Eventify API on http://localhost:${port} · database: ${config.databaseUrl ? 'Postgres' : 'local file'} · email: ${config.resendApiKey ? 'Resend' : 'printed here'} · SMS: ${config.sms ? "Africa's Talking" : sms ? 'printed here' : 'off'} · payments: ${config.payments}`,
  );
});
