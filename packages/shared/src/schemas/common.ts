import { z } from 'zod';

export const idSchema = z.string().min(1);
/** ISO 8601 with an explicit offset, e.g. 2026-10-02T19:00:00+03:00 (EAT). */
export const dateTimeSchema = z.iso.datetime({ offset: true });
export const moneySchema = z.int().nonnegative();
export const rateBpsSchema = z.int().min(0).max(10_000);
export const handleSchema = z.string().regex(/^[a-z0-9-]{2,40}$/);
export const slugSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
