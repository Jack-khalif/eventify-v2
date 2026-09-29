import { QueryClient } from '@tanstack/react-query';
import { isNotFound } from '../lib/api';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // A missing event won't appear on retry; other failures get the usual retries.
        retry: (failureCount, error) => !isNotFound(error) && failureCount < 3,
      },
    },
  });
}
