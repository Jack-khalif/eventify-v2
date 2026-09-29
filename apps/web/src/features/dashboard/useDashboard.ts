import {
  createEventRequestSchema,
  eventDashboardSchema,
  organizerHomeSchema,
  publicEventSchema,
  type CreateEventRequest,
} from '@eventify/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../../lib/api';

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
