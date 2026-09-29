import {
  CATEGORIES,
  CITIES,
  citySchema,
  discoverCategorySchema,
  upcomingWeekend,
  type City,
  type DiscoverCategory,
} from '@eventify/shared';
import { MapPin, Search } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button, buttonClass, Chip } from '../../components/ui';
import { EventCard, EventCardSkeleton } from './EventCard';
import { useEvents } from './useEvents';

const CHIPS: readonly ('All' | DiscoverCategory)[] = ['All', ...CATEGORIES, 'Free'];
const SEARCH_DEBOUNCE_MS = 250;

/** Filters live in the URL (?city=Juba&category=Campus&q=jazz) so results can be shared and Back works. */
function useDiscoverFilters() {
  const [params, setParams] = useSearchParams();
  const city = citySchema.safeParse(params.get('city')).data;
  const category = discoverCategorySchema.safeParse(params.get('category')).data;
  const q = params.get('q') ?? '';

  const update = (patch: Record<string, string | undefined>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true },
    );

  return { city, category, q, update, clear: () => setParams({}, { replace: true }) };
}

export function DiscoverPage() {
  const { city, category, q, update, clear } = useDiscoverFilters();
  const [searchText, setSearchText] = useState(q);

  useEffect(() => {
    if (searchText.trim() === q) return;
    const timer = setTimeout(
      () => update({ q: searchText.trim() || undefined }),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
    // `update` is recreated every render; only the typed text should restart the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText, q]);

  const weekend = useMemo(() => upcomingWeekend(), []);
  const weekendEvents = useEvents({ city, from: weekend.from, to: weekend.to });
  const results = useEvents({ city, category, q: q || undefined });

  const clearFilters = () => {
    setSearchText('');
    clear();
  };

  return (
    <>
      <section className="mx-auto flex w-full max-w-[1240px] flex-col gap-[18px] px-5 pt-7 pb-6">
        <h1 className="m-0 max-w-[900px] text-[38px] leading-[1.02] tracking-[-0.03em] text-pretty md:mt-3 md:text-[76px] md:leading-[0.98] md:tracking-[-0.035em]">
          What's on in{' '}
          <span className="rounded-lg bg-accent px-1.5 text-accent-ink md:rounded-xl md:px-2.5">
            {city ?? 'East Africa'}
          </span>
        </h1>
        <p className="m-0 max-w-[560px] text-base text-pretty text-muted">
          Concerts, campus events, conferences and workshops across Kenya and South Sudan. Pay with
          M-Pesa or MTN MoMo in under a minute.
        </p>

        <div className="flex flex-wrap items-stretch gap-2.5">
          <label className="flex h-[52px] min-w-0 flex-[1_1_280px] items-center gap-2.5 rounded-xl border-2 border-rule bg-bg px-4">
            <Search size={20} aria-hidden />
            <input
              type="search"
              aria-label="Search events"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search events, artists, venues"
              className="min-w-0 flex-1 border-0 bg-transparent text-base text-fg outline-none placeholder:text-muted"
            />
          </label>
          <label className="flex h-[52px] flex-[0_1_200px] items-center gap-2 rounded-xl border-2 border-rule px-3.5">
            <MapPin size={18} aria-hidden />
            <select
              aria-label="City"
              value={city ?? ''}
              onChange={(e) => update({ city: e.target.value || undefined })}
              className="flex-1 cursor-pointer border-0 bg-transparent text-[15px] font-semibold text-fg outline-none"
            >
              <option value="">All cities</option>
              {CITIES.map((c: City) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div
          role="group"
          aria-label="Category"
          className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5"
        >
          {CHIPS.map((c) => (
            <Chip
              key={c}
              active={(category ?? 'All') === c}
              onClick={() => update({ category: c === 'All' ? undefined : c })}
            >
              {c}
            </Chip>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="weekend-heading"
        className="mx-auto w-full max-w-[1240px] border-t-2 border-rule pt-6 pb-2"
      >
        <SectionHeading id="weekend-heading" title="This weekend" meta={weekend.label} />
        <QueryState
          query={weekendEvents}
          skeleton={
            <Rail>
              {[0, 1, 2].map((i) => (
                <EventCardSkeleton key={i} variant="rail" />
              ))}
            </Rail>
          }
          empty={
            <p className="m-0 px-5 pb-4 text-sm text-muted">Nothing listed for this weekend yet.</p>
          }
        >
          {(events) => (
            <Rail>
              {events.map((e) => (
                <EventCard key={e.id} event={e} variant="rail" />
              ))}
            </Rail>
          )}
        </QueryState>
      </section>

      <section
        aria-labelledby="upcoming-heading"
        className="mx-auto w-full max-w-[1240px] border-t-2 border-rule px-5 pt-6 pb-10"
      >
        <SectionHeading
          id="upcoming-heading"
          title="Upcoming"
          meta={
            results.data &&
            `${results.data.length} ${results.data.length === 1 ? 'event' : 'events'}`
          }
          flush
        />
        <QueryState
          query={results}
          skeleton={
            <Grid>
              {[0, 1, 2, 3].map((i) => (
                <EventCardSkeleton key={i} />
              ))}
            </Grid>
          }
          empty={
            <div className="flex flex-col items-start gap-2 rounded-2xl border-2 border-dashed border-hair px-6 py-8">
              <span className="text-lg font-extrabold">No events match yet</span>
              <span className="text-sm text-muted">
                Try another city or category — or be the first to host one here.
              </span>
              <Button variant="outline" size="sm" className="mt-2" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          }
        >
          {(events) => (
            <Grid>
              {events.map((e) => (
                <EventCard key={e.id} event={e} />
              ))}
            </Grid>
          )}
        </QueryState>
      </section>

      <section className="bg-accent text-accent-ink">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-end justify-between gap-5 px-5 py-9">
          <div className="flex max-w-[560px] flex-col gap-2">
            <span className="text-[28px] leading-[1.08] font-extrabold tracking-[-0.02em] text-pretty">
              Hosting something?
            </span>
            <span className="text-[15px]">
              Every event gets a short link, a share card, and queue-free Express Entry at the door.
            </span>
          </div>
          <Link
            to="/organizer/events/new"
            className={buttonClass({
              variant: 'ink',
              size: 'md',
              className: 'min-w-[200px] justify-start text-white hover:text-white',
            })}
          >
            Create an event →
          </Link>
        </div>
      </section>
    </>
  );
}

function SectionHeading({
  id,
  title,
  meta,
  flush = false,
}: {
  id: string;
  title: string;
  meta?: ReactNode;
  flush?: boolean;
}) {
  return (
    <div
      className={
        flush ? 'mb-[18px] flex items-baseline gap-3' : 'flex items-baseline gap-3 px-5 pb-4'
      }
    >
      <h2 id={id} className="m-0 text-2xl tracking-[-0.02em]">
        {title}
      </h2>
      {meta && <span className="text-[13px] font-semibold text-muted">{meta}</span>}
    </div>
  );
}

const Rail = ({ children }: { children: ReactNode }) => (
  <div className="no-scrollbar flex gap-4 overflow-x-auto px-5 pb-4">{children}</div>
);

const Grid = ({ children }: { children: ReactNode }) => (
  <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-x-5 gap-y-7">
    {children}
  </div>
);

type ListQuery<T> = {
  data: T[] | undefined;
  isPending: boolean;
  isError: boolean;
  refetch: () => unknown;
};

/** Loading → skeleton, error → retry, empty → message, otherwise the list. */
function QueryState<T>({
  query,
  skeleton,
  empty,
  children,
}: {
  query: ListQuery<T>;
  skeleton: ReactNode;
  empty: ReactNode;
  children: (items: T[]) => ReactNode;
}) {
  if (query.isPending) return skeleton;
  if (query.isError || !query.data) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 px-5 pb-4 text-sm">
        <span>Couldn't load events. Check your connection and try again.</span>
        <Button variant="outline" size="sm" onClick={() => query.refetch()}>
          Retry
        </Button>
      </div>
    );
  }
  return query.data.length === 0 ? empty : children(query.data);
}
