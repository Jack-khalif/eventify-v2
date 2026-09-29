import { publicEventSchema } from '@eventify/shared';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../lib/api';

export function useEvent(slug: string) {
  return useQuery({
    queryKey: ['event', slug],
    queryFn: () => apiGet(`/api/events/${encodeURIComponent(slug)}`, publicEventSchema),
  });
}
