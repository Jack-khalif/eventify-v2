import { toEatIso } from '@eventify/shared';
import { sql, type AnyColumn } from 'drizzle-orm';

const DAY_MS = 24 * 60 * 60_000;
const EAT_OFFSET_MS = 3 * 60 * 60_000;

export const eatIso = (d: Date) => toEatIso(d.getTime());

/** Days since 1970 as counted in EAT, so "today" turns over at midnight in Nairobi. */
export const eatDay = (ms: number) => Math.floor((ms + EAT_OFFSET_MS) / DAY_MS);

/**
 * The same day number, worked out by the database from a timestamp column. The numbers are written
 * into the SQL rather than passed as parameters, so the expression is identical in SELECT and
 * GROUP BY.
 */
export const eatDaySql = (column: AnyColumn) =>
  sql<number>`floor((extract(epoch from ${column}) + ${sql.raw(String(EAT_OFFSET_MS / 1000))}) / ${sql.raw(String(DAY_MS / 1000))})::int`;

/** The first instant of an EAT day number. */
export const eatDayStart = (day: number) => new Date(day * DAY_MS - EAT_OFFSET_MS);
