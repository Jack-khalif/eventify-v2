import { normalizeEmail, PASSWORD_MIN_LENGTH } from '@eventify/shared';
import { eq } from 'drizzle-orm';
import { endAllSessions } from './auth';
import { loadConfig } from './config';
import { openDatabase } from './db/client';
import { accounts } from './db/schema';
import { hashPassword } from './passwords';

/**
 * `npm run set-password -- someone@example.com 'new password'`: give an organizer a new password
 * and sign them out everywhere. For forgotten passwords until reset emails can be sent.
 */
const [emailArg, password] = process.argv.slice(2);
if (!emailArg || !password || password.length < PASSWORD_MIN_LENGTH) {
  console.error(`Usage: set-password <email> <password of ${PASSWORD_MIN_LENGTH}+ characters>`);
  process.exit(1);
}
const database = openDatabase(loadConfig().databaseUrl);
const [account] = await database.db
  .select()
  .from(accounts)
  .where(eq(accounts.email, normalizeEmail(emailArg)));
if (!account) {
  console.error('No account has that email.');
} else if (account.role === 'agent' || account.role === 'super_admin') {
  console.error('Staff sign in with an emailed code, not a password.');
} else {
  await database.db
    .update(accounts)
    .set({ passwordHash: await hashPassword(password) })
    .where(eq(accounts.id, account.id));
  await endAllSessions(database.db, account.id);
  console.log(`Password set for ${account.email}. They are signed out everywhere.`);
}
await database.close();
