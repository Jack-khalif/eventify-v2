import { QueryClient } from '@tanstack/react-query';
import { isFinalError } from '../lib/api';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // A missing event or a "no access" won't change on retry; other failures get the usual retries.
        retry: (failureCount, error) => !isFinalError(error) && failureCount < 3,
      },
    },
  });
}
