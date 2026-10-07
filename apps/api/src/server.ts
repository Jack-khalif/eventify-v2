import { importSigningKey } from '@eventify/shared';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { loadConfig } from './config';
import { openDatabase } from './db/client';
import { seedSamples } from './db/samples';
import { consoleMailer, resendMailer } from './email/mailer';
import { simulatedPayments } from './payments';

const config = loadConfig();
const database = openDatabase(config.databaseUrl);

if (!config.databaseUrl) {
  // The local development database looks after itself; a real one is migrated with `npm run db:migrate`.
  await database.migrate();
  if (await seedSamples(database.db)) console.log('Added the sample organizers and events.');
}

const signingKey = config.qrPrivateKey
  ? await importSigningKey(JSON.parse(config.qrPrivateKey) as JsonWebKey)
  : ((await crypto.subtle.generateKey('Ed25519', false, ['sign', 'verify'])) as CryptoKeyPair)
      .privateKey;

const app = createApp({
  db: database.db,
  mailer: config.resendApiKey ? resendMailer(config.resendApiKey, config.emailFrom) : consoleMailer,
  payments: config.payments === 'simulated' ? simulatedPayments : null,
  signingKey,
  siteUrl: config.siteUrl,
  superAdminEmails: config.superAdminEmails,
});

serve({ fetch: app.fetch, port: config.port }, ({ port }) => {
  console.log(
    `Eventify API on http://localhost:${port} · database: ${config.databaseUrl ? 'Postgres' : 'local file'} · email: ${config.resendApiKey ? 'Resend' : 'printed here'} · payments: ${config.payments}`,
  );
});
