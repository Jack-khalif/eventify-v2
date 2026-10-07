import { PGlite } from '@electric-sql/pglite';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';
import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Database = {
  db: Db;
  /** Bring the tables up to date with the migrations in apps/api/drizzle. */
  migrate: () => Promise<void>;
  close: () => Promise<void>;
};

const migrationsFolder = join(import.meta.dirname, '../../drizzle');

/** Real Postgres, for production. */
export function connectPostgres(url: string): Database {
  // prepare: false because pooled connections (Neon, PgBouncer) can't keep prepared statements.
  const sql = postgres(url, { prepare: false });
  const db = drizzlePostgres(sql, { schema });
  return { db, migrate: () => migratePostgres(db, { migrationsFolder }), close: () => sql.end() };
}

/**
 * Postgres running inside this process (PGlite), so development and tests need no database server.
 * `dataDir` keeps the data in a folder between runs; leave it out for a throwaway in-memory one.
 */
export function openLocalDatabase(dataDir?: string): Database {
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzlePglite(client, { schema });
  return {
    db,
    migrate: () => migratePglite(db, { migrationsFolder }),
    close: () => client.close(),
  };
}

export const LOCAL_DATA_DIR = join(import.meta.dirname, '../../.data/pglite');

export const openDatabase = (databaseUrl: string | null): Database =>
  databaseUrl ? connectPostgres(databaseUrl) : openLocalDatabase(LOCAL_DATA_DIR);
