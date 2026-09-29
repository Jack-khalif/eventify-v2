import { organizerProfileSchema } from '@eventify/shared';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../lib/api';

export function useOrganizer(handle: string) {
  return useQuery({
    queryKey: ['organizer', handle],
    queryFn: () => apiGet(`/api/organizers/${encodeURIComponent(handle)}`, organizerProfileSchema),
  });
}
