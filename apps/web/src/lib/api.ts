import { apiErrorBodySchema } from '@eventify/shared';
import type { z } from 'zod';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Stable error code from the API body, e.g. "sold_out". */
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Turn a failed response into an ApiError, keeping the API's buyer-facing message when there is one. */
async function toApiError(res: Response, fallback: string) {
  const body = apiErrorBodySchema.safeParse(await res.json().catch(() => null));
  return body.success
    ? new ApiError(res.status, body.data.message, body.data.error)
    : new ApiError(res.status, fallback);
}

export const isNotFound = (error: unknown) => error instanceof ApiError && error.status === 404;

type Params = Record<string, string | undefined>;

/**
 * GET a JSON endpoint and validate the response against the shared schema,
 * so a mismatch between frontend and backend fails loudly instead of rendering garbage.
 */
export async function apiGet<T>(
  path: string,
  schema: z.ZodType<T>,
  params: Params = {},
): Promise<T> {
  const url = new URL(BASE_URL + path, window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  const res = await fetch(url);
  if (!res.ok) throw await toApiError(res, `GET ${path} failed with ${res.status}`);
  return schema.parse(await res.json());
}

export async function apiPost<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(new URL(BASE_URL + path, window.location.origin), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw await toApiError(res, 'Something went wrong. Please try again.');
  return schema.parse(await res.json());
}
