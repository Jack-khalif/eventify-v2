import {
  ticketTransferRequestSchema,
  ticketTransferResultSchema,
  ticketViewSchema,
  ticketsResultSchema,
  type TicketTransferRequest,
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

/** Tickets bought with the signed-in email. */
export function useMyTickets({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['my-tickets'],
    queryFn: async () => {
      const { tickets } = await apiGet('/api/me/tickets', ticketsResultSchema);
      for (const t of tickets) queryClient.setQueryData(['ticket', t.id], t);
      return tickets;
    },
    enabled,
  });
}

/**
 * Pass a ticket on. Its pass stops working straight away, so it is dropped from every list this
 * visit holds; asking for it again tells whoever opens the link that it was transferred.
 */
export function useTransferTicket(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: TicketTransferRequest) =>
      apiPost(
        `/api/tickets/${encodeURIComponent(ticketId)}/transfer`,
        ticketTransferRequestSchema.parse(req),
        ticketTransferResultSchema,
      ),
    onSuccess: async () => {
      await Promise.all([
        // Not refetched now: the screen that did this says so itself.
        queryClient.invalidateQueries({ queryKey: ['ticket', ticketId], refetchType: 'none' }),
        queryClient.invalidateQueries({ queryKey: ['my-tickets'] }),
        queryClient.invalidateQueries({ queryKey: ['order'] }),
      ]);
    },
  });
}

/** From the link of a ticket that was passed on: email the new holder their ticket again. */
export function useResendTransfer(oldTicketId: string) {
  return useMutation({
    mutationFn: () =>
      apiPost(
        `/api/tickets/${encodeURIComponent(oldTicketId)}/transfer/resend`,
        {},
        ticketTransferResultSchema,
      ),
  });
}
