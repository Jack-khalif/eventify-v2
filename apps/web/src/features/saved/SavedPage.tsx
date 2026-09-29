import { Heart } from 'lucide-react';
import { Link } from 'react-router';
import { buttonClass } from '../../components/ui';
import { useSavedEvents } from '../../lib/saved';
import { EventCard, EventCardSkeleton } from '../discover/EventCard';
import { useEvents } from '../discover/useEvents';

/** Not in the design (its Saved tab had no screen); built in the same style as Discover. */
export function SavedPage() {
  const { ids } = useSavedEvents();
  const hasSaved = ids.length > 0;
  const events = useEvents({ ids: [...ids].sort().join(',') }, { enabled: hasSaved });
  // Keep the order the user saved them in (newest first), not event date.
  const ordered = events.data
    ?.filter((e) => ids.includes(e.id))
    .sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));

  return (
    <section className="mx-auto flex w-full max-w-[1240px] flex-col gap-6 px-5 pt-7 pb-10">
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-[38px] leading-[1.02] tracking-[-0.03em] md:text-[56px]">Saved</h1>
        <p className="m-0 text-muted">Events you've saved on this device.</p>
      </div>

      {!hasSaved ? (
        <div className="flex flex-col items-start gap-2 rounded-2xl border-2 border-dashed border-hair px-6 py-8">
          <span className="text-lg font-extrabold">Nothing saved yet</span>
          <span className="flex items-center gap-1.5 text-sm text-muted">
            Tap the <Heart size={14} aria-label="heart" /> on any event to keep it here.
          </span>
          <Link
            to="/"
            className={buttonClass({ variant: 'outline', size: 'sm', className: 'mt-2 text-fg' })}
          >
            Find events
          </Link>
        </div>
      ) : events.isPending ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-x-5 gap-y-7">
          {ids.map((id) => (
            <EventCardSkeleton key={id} />
          ))}
        </div>
      ) : events.isError ? (
        <p role="alert" className="m-0 text-sm">
          Couldn't load your saved events. Check your connection and try again.
        </p>
      ) : ordered && ordered.length > 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-x-5 gap-y-7">
          {ordered.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      ) : (
        <p className="m-0 text-sm text-muted">The events you saved have ended.</p>
      )}
    </section>
  );
}
