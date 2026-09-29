import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ErrorState, NotFoundState } from '../../components/PageStates';
import { ApiError, isNotFound } from '../../lib/api';

/** Loading, no-access, not-found and error states for an admin query; renders `children` with the data. */
export function QueryView<T>({
  query,
  label,
  children,
}: {
  query: UseQueryResult<T>;
  /** "organizers": used in "Couldn't load organizers." */
  label: string;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) {
    return <div aria-busy="true" aria-label={`Loading ${label}`} className="h-64" />;
  }
  if (query.error instanceof ApiError && query.error.status === 403) {
    return (
      <p role="alert" className="m-0 rounded-xl bg-surface p-4 text-sm">
        Only a Super Admin can see this page.
      </p>
    );
  }
  if (isNotFound(query.error)) {
    return (
      <NotFoundState title="Not found" message="It may have been removed, or the link is wrong." />
    );
  }
  if (query.isError) {
    return <ErrorState onRetry={query.refetch}>Couldn't load {label}.</ErrorState>;
  }
  return <>{children(query.data)}</>;
}
