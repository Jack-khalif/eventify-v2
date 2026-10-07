import { loadConfig } from '../config';
import { openDatabase } from './client';
import { seedSamples } from './samples';

/** `npm run db:seed`: add the sample organizers and events, for trying things out. Not for production. */
const database = openDatabase(loadConfig().databaseUrl);
const added = await seedSamples(database.db);
await database.close();
console.log(added ? 'Sample data added.' : 'The database already has data; nothing added.');
