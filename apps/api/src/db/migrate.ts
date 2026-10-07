import { loadConfig } from '../config';
import { openDatabase } from './client';

/** `npm run db:migrate`: bring the configured database up to date. */
const database = openDatabase(loadConfig().databaseUrl);
await database.migrate();
await database.close();
console.log('Database is up to date.');
