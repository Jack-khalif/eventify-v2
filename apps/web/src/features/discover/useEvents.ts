import { publicEventSchema, type EventQuery } from '@eventify/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiGet } from '../../lib/api';

const eventListSchema = z.array(publicEventSchema);

export function useEvents(query: EventQuery, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['events', query],
    queryFn: () => apiGet('/api/events', eventListSchema, query),
    // Keep the old results on screen while a new filter loads, instead of flashing a skeleton.
    placeholderData: keepPreviousData,
    enabled,
  });
}
