import {
  organizerApplicationRequestSchema,
  organizerSignUpRequestSchema,
  passwordSignInSchema,
  sessionSchema,
  sessionUserSchema,
  signInResultSchema,
  totpCodeRequestSchema,
  totpSetupSchema,
  totpSignInSchema,
  totpStatusSchema,
  signInStartResultSchema,
  signInStartSchema,
  signInVerifySchema,
  type OrganizerApplicationRequest,
  type OrganizerSignUpRequest,
  type Session,
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

/**
 * Sign in with a password (organizers). Like the emailed code, an account with two-step sign-in
 * gets a challenge back, which useCompleteTwoStep() finishes.
 */
export function usePasswordSignIn() {
  const open = useOpenSession();
  return useMutation({
    mutationFn: (req: { email: string; password: string }) =>
      apiPost('/api/auth/login', passwordSignInSchema.parse(req), signInResultSchema),
    onSuccess: (result) => {
      if ('token' in result) open(result);
    },
  });
}

/** Create an organizer account and send its application in one step; signed in afterwards. */
export function useSignUpOrganizer() {
  const open = useOpenSession();
  return useMutation({
    mutationFn: (req: OrganizerSignUpRequest) =>
      apiPost('/api/organizer/signup', organizerSignUpRequestSchema.parse(req), sessionSchema),
    onSuccess: open,
  });
}

/** The emailed code, step 1: send one to this address. */
export function useStartSignIn() {
  return useMutation({
    mutationFn: (email: string) =>
      apiPost('/api/auth/start', signInStartSchema.parse({ email }), signInStartResultSchema),
  });
}

function useOpenSession() {
  const queryClient = useQueryClient();
  return ({ token, user }: Session) => {
    forgetPersonalData(queryClient);
    queryClient.setQueryData([SESSION, token], user);
    setSessionToken(token);
  };
}

/**
 * The emailed code, step 2: exchange it for a session. Accounts with two-step sign-in get a challenge back
 * instead, which useCompleteTwoStep() finishes.
 */
export function useVerifySignIn() {
  const open = useOpenSession();
  return useMutation({
    mutationFn: (req: { email: string; code: string }) =>
      apiPost('/api/auth/verify', signInVerifySchema.parse(req), signInResultSchema),
    onSuccess: (result) => {
      if ('token' in result) open(result);
    },
  });
}

/** For accounts with two-step sign-in: the code from the authenticator app. */
export function useCompleteTwoStep() {
  const open = useOpenSession();
  return useMutation({
    mutationFn: (req: { challenge: string; code: string }) =>
      apiPost('/api/auth/totp', totpSignInSchema.parse(req), sessionSchema),
    onSuccess: open,
  });
}

const TWO_STEP = 'two-step';

/** Whether the signed-in account uses an authenticator app. */
export function useTwoStepStatus() {
  const token = useSessionToken();
  return useQuery({
    queryKey: [TWO_STEP, token],
    queryFn: () => apiGet('/api/auth/totp', totpStatusSchema),
    enabled: !!token,
  });
}

/** Ask for a new secret to scan. Nothing is switched on until a code is confirmed. */
export function useBeginTwoStep() {
  return useMutation({
    mutationFn: () => apiPost('/api/auth/totp/setup', {}, totpSetupSchema),
  });
}

/** Switch two-step sign-in on or off; either way needs a code from the app. */
export function useSetTwoStep(enabled: boolean) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      apiPost(
        `/api/auth/totp/${enabled ? 'enable' : 'disable'}`,
        totpCodeRequestSchema.parse({ code }),
        totpStatusSchema,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [TWO_STEP] }),
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
