import type { OrganizerProfile } from '@eventify/shared';
import { useParams } from 'react-router';
import { Avatar } from '../../components/Avatar';
import { BackLink } from '../../components/BackLink';
import { ErrorState, NotFoundState } from '../../components/PageStates';
import { Cover } from '../../components/ui';
import { VerifiedBadge } from '../../components/VerifiedBadge';
import { isNotFound } from '../../lib/api';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { EventCard, EventCardSkeleton } from '../discover/EventCard';
import { useEvents } from '../discover/useEvents';
import { FollowButton } from './FollowButton';
import { useOrganizer } from './useOrganizer';

const grid = 'grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4';

/** Public organizer page: eventify.co/{handle}. */
export function OrganizerPage() {
  const { handle = '' } = useParams();
  const query = useOrganizer(handle);
  useDocumentTitle(query.data?.name);

  if (query.isPending) {
    return (
      <div
        aria-busy="true"
        aria-label="Loading organizer"
        className="mx-auto w-full max-w-[1000px] animate-pulse px-5 pt-16"
      >
        <div className="h-[180px] rounded-[20px] bg-surface-2" />
      </div>
    );
  }
  if (isNotFound(query.error)) {
    return <NotFoundState title="Page not found" message="There's no organizer at this address." />;
  }
  if (query.isError) {
    return <ErrorState onRetry={query.refetch}>Couldn't load this organizer.</ErrorState>;
  }
  return <OrganizerDetails organizer={query.data} />;
}

function OrganizerDetails({ organizer: o }: { organizer: OrganizerProfile }) {
  const upcoming = useEvents({ organizer: o.handle });

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col px-5 pt-4 pb-10">
      <BackLink label="Discover" fallback="/discover" />
      <Cover tone={o.bannerTone} className="mt-3.5 h-[180px] rounded-[20px]" />

      <div className="flex flex-col gap-6">
        <div className="-mt-10 flex flex-wrap items-end gap-4">
          <Avatar
            name={o.name}
            className="relative size-[88px] rounded-[20px] border-4 border-bg text-[26px]"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 pb-1">
            <h1 className="m-0 flex items-center gap-1.5 text-[22px] tracking-normal">
              {o.name}
              {o.verified && <VerifiedBadge size={19} />}
            </h1>
            <span className="text-[13px] text-muted">
              {o.type} · eventify.co/{o.handle}
            </span>
          </div>
          <FollowButton handle={o.handle} name={o.name} className="px-[18px] py-2.5" />
        </div>

        {o.bio && (
          <p className="m-0 max-w-[640px] text-[15px] leading-[1.6] text-pretty">{o.bio}</p>
        )}

        <section aria-labelledby="org-upcoming" className="flex flex-col gap-3">
          <h2 id="org-upcoming" className="m-0 text-xl">
            Upcoming events
          </h2>
          {upcoming.isPending ? (
            <div className={grid}>
              <EventCardSkeleton />
              <EventCardSkeleton />
            </div>
          ) : upcoming.data && upcoming.data.length > 0 ? (
            <div className={grid}>
              {upcoming.data.map((e) => (
                <EventCard key={e.id} event={e} variant="compact" />
              ))}
            </div>
          ) : (
            <span className="text-sm text-muted">
              {upcoming.isError ? "Couldn't load events." : 'No upcoming events right now.'}
            </span>
          )}
        </section>

        {o.pastEvents.length > 0 && (
          <section
            aria-labelledby="org-past"
            className="flex flex-col gap-3 border-t-2 border-rule pt-5"
          >
            <h2 id="org-past" className="m-0 text-xl">
              Past events
            </h2>
            <div className={grid}>
              {o.pastEvents.map((p) => (
                <div key={`${p.title}-${p.date}`} className="flex flex-col gap-2 opacity-75">
                  <Cover tone={p.tone} className="aspect-[4/3] rounded-xl grayscale-[0.3]" />
                  <span className="text-sm leading-[1.2] font-extrabold">{p.title}</span>
                  <span className="text-xs text-muted">{p.date}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
