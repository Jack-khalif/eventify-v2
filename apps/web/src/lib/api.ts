import type { z } from 'zod';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
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
  if (!res.ok) throw new ApiError(res.status, `GET ${path} failed with ${res.status}`);
  return schema.parse(await res.json());
}
