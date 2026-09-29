import { eventDescription, formatDate, formatTimeRange, type PublicEvent } from '@eventify/shared';
import { CalendarDays, MapPin } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Avatar } from '../../components/Avatar';
import { BackLink } from '../../components/BackLink';
import { ErrorState, NotFoundState } from '../../components/PageStates';
import { Cover } from '../../components/ui';
import { VerifiedBadge } from '../../components/VerifiedBadge';
import { isNotFound } from '../../lib/api';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { FollowButton } from '../organizer/FollowButton';
import { SaveButton } from '../saved/SaveButton';
import { directionsUrl, downloadCalendarFile } from './calendar';
import { ShareBlock } from './ShareBlock';
import { BuyBar, TicketPanel } from './TicketPanel';
import { useEvent } from './useEvent';
import { useTicketSelection } from './useTicketSelection';

export function EventPage() {
  const { slug = '' } = useParams();
  const query = useEvent(slug);
  useDocumentTitle(query.data?.title);

  if (query.isPending) return <EventSkeleton />;
  if (isNotFound(query.error)) {
    return (
      <NotFoundState
        title="Event not found"
        message="It may have been removed, or the link might be wrong."
      />
    );
  }
  if (query.isError) {
    return <ErrorState onRetry={query.refetch}>Couldn't load this event.</ErrorState>;
  }
  // Keyed so switching events resets the ticket selection.
  return <EventDetails key={query.data.id} event={query.data} />;
}

function EventDetails({ event: e }: { event: PublicEvent }) {
  const selection = useTicketSelection(e);

  return (
    <>
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-3.5 px-5 pt-4">
        <BackLink label="All events" />
        <Cover
          tone={e.coverTone}
          imageUrl={e.coverImageUrl}
          alt={`${e.title} cover`}
          className="aspect-[16/7] min-h-[200px] rounded-[20px]"
        >
          <SaveButton eventId={e.id} title={e.title} className="absolute top-4 right-4" />
        </Cover>
      </div>

      <div className="mx-auto flex w-full max-w-[1240px] flex-wrap items-start gap-10 px-5 pt-6 pb-12">
        <article className="flex min-w-0 flex-[1_1_520px] flex-col gap-6">
          <div className="flex flex-col gap-3">
            <span className="text-xs font-extrabold tracking-[0.1em] text-accent-text uppercase">
              {e.category} · {e.city}
            </span>
            <h1 className="m-0 text-[32px] leading-[1.02] tracking-[-0.03em] text-pretty md:text-[40px]">
              {e.title}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              to={`/${e.organizer.handle}`}
              className="mr-auto flex min-w-0 items-center gap-3 text-fg no-underline hover:text-fg"
            >
              <Avatar name={e.organizer.name} className="size-11 rounded-full text-[15px]" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-[15px] font-extrabold">
                  {e.organizer.name}
                  {e.organizer.verified && <VerifiedBadge />}
                </span>
                <span className="text-[13px] text-muted">
                  {e.organizer.type} · eventify.co/{e.organizer.handle}
                </span>
              </span>
            </Link>
            <FollowButton handle={e.organizer.handle} name={e.organizer.name} />
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] border-y-2 border-rule">
            <div className="flex gap-3 py-4 pr-4">
              <CalendarDays size={22} className="mt-0.5 flex-none" aria-hidden />
              <div className="flex flex-col gap-0.5">
                <span className="text-[15px] font-extrabold">{formatDate(e.startsAt)}</span>
                <span className="text-sm text-muted">
                  {formatTimeRange(e.startsAt, e.endsAt)} EAT
                </span>
                <button
                  type="button"
                  onClick={() => downloadCalendarFile(e)}
                  className="mt-1 cursor-pointer self-start text-[13px] font-semibold text-accent-text hover:text-fg"
                >
                  Add to calendar
                </button>
              </div>
            </div>
            <div className="flex gap-3 py-4 pr-4">
              <MapPin size={22} className="mt-0.5 flex-none" aria-hidden />
              <div className="flex flex-col gap-0.5">
                <span className="text-[15px] font-extrabold">{e.venue}</span>
                {e.address && <span className="text-sm text-muted">{e.address}</span>}
                <a
                  href={directionsUrl(e)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 text-[13px] font-semibold"
                >
                  Get directions
                </a>
              </div>
            </div>
          </div>

          <a
            href={directionsUrl(e)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${e.venue} in Google Maps`}
            className="relative block h-[200px] overflow-hidden rounded-2xl bg-surface bg-[linear-gradient(var(--ev-hair)_1px,transparent_1px),linear-gradient(90deg,var(--ev-hair)_1px,transparent_1px)] bg-[size:32px_32px]"
          >
            <span className="absolute top-[44%] left-1/2 -translate-x-1/2 -translate-y-full">
              <span className="block size-9 -rotate-45 rounded-[999px_999px_999px_0] border-[3px] border-rule bg-accent" />
            </span>
            <span className="absolute bottom-3 left-3.5 font-mono text-[11px] text-muted">
              Open in Maps · {e.venue}
            </span>
          </a>

          <section aria-labelledby="about-heading" className="flex flex-col gap-2.5">
            <h2 id="about-heading" className="m-0 text-[22px]">
              About
            </h2>
            {eventDescription(e).map((para, i) => (
              <p key={i} className="m-0 max-w-[640px] text-base leading-[1.6] text-pretty">
                {para}
              </p>
            ))}
          </section>

          <ShareBlock event={e} />
        </article>

        <TicketPanel event={e} selection={selection} />
      </div>

      <BuyBar selection={selection} />
    </>
  );
}

function EventSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading event"
      className="mx-auto flex w-full max-w-[1240px] animate-pulse flex-col gap-6 px-5 pt-4"
    >
      <div className="h-8 w-28 rounded-md bg-surface-2" />
      <div className="aspect-[16/7] min-h-[200px] rounded-[20px] bg-surface-2" />
      <div className="h-10 w-2/3 rounded-md bg-surface-2" />
      <div className="h-4 w-1/3 rounded-md bg-surface-2" />
    </div>
  );
}
