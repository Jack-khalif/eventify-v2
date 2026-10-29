import {
  compListSchema,
  compRequestSchema,
  createEventRequestSchema,
  eventDashboardSchema,
  merchListSchema,
  merchRequestSchema,
  organizerHomeSchema,
  publicEventSchema,
  type CompRequest,
  type CreateEventRequest,
  type MerchRequest,
} from '@eventify/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost } from '../../lib/api';

/** Signed-in organizer and their events. ("organizer" keys are public profiles.) */
export function useOrganizerHome() {
  return useQuery({
    queryKey: ['my-organizer'],
    queryFn: () => apiGet('/api/organizer/me', organizerHomeSchema),
  });
}

export function useEventDashboard(eventId: string | undefined) {
  return useQuery({
    queryKey: ['my-organizer', 'dashboard', eventId],
    queryFn: () =>
      apiGet(
        `/api/organizer/events/${encodeURIComponent(eventId ?? '')}/dashboard`,
        eventDashboardSchema,
      ),
    enabled: !!eventId,
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateEventRequest) =>
      apiPost('/api/organizer/events', createEventRequestSchema.parse(req), publicEventSchema),
    onSuccess: async (event) => {
      queryClient.setQueryData(['event', event.slug], event);
      // The new event belongs on the dashboard and on Discover.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['my-organizer'] }),
        queryClient.invalidateQueries({ queryKey: ['events'] }),
      ]);
    },
  });
}

/** Take an event down for good. The API refuses once tickets have been issued. */
export function useDeleteEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (event: { id: string; slug: string }) =>
      apiDelete(`/api/organizer/events/${encodeURIComponent(event.id)}`),
    onSuccess: async (_, event) => {
      queryClient.removeQueries({ queryKey: ['event', event.slug] });
      queryClient.removeQueries({ queryKey: ['my-organizer', 'dashboard', event.id] });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['my-organizer'], exact: true }),
        queryClient.invalidateQueries({ queryKey: ['events'] }),
      ]);
    },
  });
}

const compsPath = (eventId: string) => `/api/organizer/events/${encodeURIComponent(eventId)}/comps`;

/** Complimentary tickets issued for an event, and the tiers they can come from. */
export function useComps(eventId: string) {
  return useQuery({
    queryKey: ['my-organizer', 'comps', eventId],
    queryFn: () => apiGet(compsPath(eventId), compListSchema),
  });
}

/** Give tickets away. They are emailed to the guest like a purchase. */
export function useIssueComps(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: CompRequest) =>
      apiPost(compsPath(eventId), compRequestSchema.parse(req), compListSchema),
    onSuccess: async (list) => {
      queryClient.setQueryData(['my-organizer', 'comps', eventId], list);
      // Comps fill capacity and appear in the check-in numbers.
      await queryClient.invalidateQueries({ queryKey: ['my-organizer', 'dashboard', eventId] });
    },
  });
}

const merchPath = (eventId: string) => `/api/organizer/events/${encodeURIComponent(eventId)}/merch`;

/** Branded print ordered for an event, with where each request is in the queue. */
export function useMerch(eventId: string) {
  return useQuery({
    queryKey: ['my-organizer', 'merch', eventId],
    queryFn: () => apiGet(merchPath(eventId), merchListSchema),
  });
}

export function useRequestMerch(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: MerchRequest) =>
      apiPost(merchPath(eventId), merchRequestSchema.parse(req), merchListSchema),
    onSuccess: (list) => queryClient.setQueryData(['my-organizer', 'merch', eventId], list),
  });
}
