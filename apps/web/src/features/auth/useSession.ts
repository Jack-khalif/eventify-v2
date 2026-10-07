import {
  organizerApplicationRequestSchema,
  sessionSchema,
  sessionUserSchema,
  signInStartResultSchema,
  signInStartSchema,
  signInVerifySchema,
  type OrganizerApplicationRequest,
  type SessionUser,
} from '@eventify/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiGet, apiPost } from '../../lib/api';
import { setSessionToken, useSessionToken } from '../../lib/session';

const SESSION = 'session';

/** Everything fetched as one person; dropped when someone else signs in or out. */
const PERSONAL_KEYS = ['admin', 'my-organizer', 'my-tickets'];

function forgetPersonalData(queryClient: QueryClient) {
  for (const key of PERSONAL_KEYS) queryClient.removeQueries({ queryKey: [key] });
}

export type SessionState =
  | { status: 'loading' | 'guest' | 'error'; user: null }
  | { status: 'signed-in'; user: SessionUser };

/**
 * Who is using the app. `guest` covers everyone who hasn't signed in: buyers never need to.
 * The role comes from the API on every load, so an approval or suspension takes effect on the
 * next visit without signing in again.
 */
export function useSession(): SessionState & {
  refetch: () => Promise<unknown>;
  isFetching: boolean;
} {
  const token = useSessionToken();
  const query = useQuery({
    queryKey: [SESSION, token],
    queryFn: () => apiGet('/api/auth/me', sessionUserSchema),
    enabled: !!token,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  const extras = { refetch: query.refetch, isFetching: query.isFetching };
  if (!token) return { status: 'guest', user: null, ...extras };
  if (query.data) return { status: 'signed-in', user: query.data, ...extras };
  return { status: query.isError ? 'error' : 'loading', user: null, ...extras };
}

/** Step 1: text a one-time code to this phone. */
export function useStartSignIn() {
  return useMutation({
    mutationFn: (phone: string) =>
      apiPost('/api/auth/start', signInStartSchema.parse({ phone }), signInStartResultSchema),
  });
}

/** Step 2: exchange the code for a session. */
export function useVerifySignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: { phone: string; code: string }) =>
      apiPost('/api/auth/verify', signInVerifySchema.parse(req), sessionSchema),
    onSuccess: ({ token, user }) => {
      forgetPersonalData(queryClient);
      queryClient.setQueryData([SESSION, token], user);
      setSessionToken(token);
    },
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    // Signing out on this device must work even if the API can't be reached.
    mutationFn: () =>
      apiPost('/api/auth/logout', {}, z.object({ ok: z.literal(true) })).catch(() => null),
    onSettled: () => {
      setSessionToken(null);
      forgetPersonalData(queryClient);
      queryClient.removeQueries({ queryKey: [SESSION] });
    },
  });
}

/** Ask to host. The answer is the same person, now an organizer waiting for approval. */
export function useApplyToHost() {
  const queryClient = useQueryClient();
  const token = useSessionToken();
  return useMutation({
    mutationFn: (req: OrganizerApplicationRequest) =>
      apiPost(
        '/api/organizer/apply',
        organizerApplicationRequestSchema.parse(req),
        sessionUserSchema,
      ),
    onSuccess: (user) => {
      forgetPersonalData(queryClient);
      queryClient.setQueryData([SESSION, token], user);
    },
  });
}
