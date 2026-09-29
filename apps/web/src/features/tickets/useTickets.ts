import {
  ticketLookupResultSchema,
  ticketLookupStartResultSchema,
  ticketLookupStartSchema,
  ticketLookupVerifySchema,
  ticketViewSchema,
  type TicketView,
} from '@eventify/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../../lib/api';

/** Refetch now and then so the pass flips to "Checked in" after the door scans it. */
const TICKET_REFRESH_MS = 30_000;

export function useTicket(ticketId: string) {
  return useQuery({
    queryKey: ['ticket', ticketId],
    queryFn: () => apiGet(`/api/tickets/${encodeURIComponent(ticketId)}`, ticketViewSchema),
    enabled: ticketId !== '',
    refetchInterval: (query) => (query.state.data?.checkedInAt ? false : TICKET_REFRESH_MS),
  });
}

/** "Find my tickets" step 1: text a one-time code to this phone. */
export function useStartLookup() {
  return useMutation({
    mutationFn: (phone: string) =>
      apiPost(
        '/api/ticket-lookup/start',
        ticketLookupStartSchema.parse({ phone }),
        ticketLookupStartResultSchema,
      ),
  });
}

type LookupResult = { phone: string; tickets: TicketView[] };
const LOOKUP_KEY = ['ticket-lookup'];

/**
 * The tickets found for the verified phone, kept for the rest of the visit so going back from a
 * pass shows the list again instead of asking for another code.
 */
export function useLookupResult() {
  const queryClient = useQueryClient();
  const query = useQuery<LookupResult | null>({
    queryKey: LOOKUP_KEY,
    queryFn: () => null,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return {
    result: query.data ?? null,
    clear: () => queryClient.setQueryData(LOOKUP_KEY, null),
  };
}

/** Step 2: exchange the code for the tickets. Each one is cached so opening a pass is instant. */
export function useVerifyLookup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: { phone: string; code: string }) =>
      apiPost(
        '/api/ticket-lookup/verify',
        ticketLookupVerifySchema.parse(req),
        ticketLookupResultSchema,
      ),
    onSuccess: ({ tickets }, { phone }) => {
      for (const t of tickets) queryClient.setQueryData(['ticket', t.id], t);
      queryClient.setQueryData<LookupResult>(LOOKUP_KEY, { phone, tickets });
    },
  });
}
