import {
  formatDate,
  formatDayNumber,
  formatMonth,
  formatTimeRange,
  formatWeekday,
  isFreeEvent,
  priceLabel,
  type PublicEvent,
} from '@eventify/shared';
import { Link } from 'react-router';
import { Cover } from '../../components/ui';
import { cn } from '../../lib/cn';
import { SaveButton } from '../saved/SaveButton';

type EventCardProps = {
  event: PublicEvent;
  /** rail = "This weekend" row (weekday badge); grid = "Upcoming" (month badge, kicker). */
  variant?: 'rail' | 'grid';
};

export function EventCard({ event: e, variant = 'grid' }: EventCardProps) {
  const rail = variant === 'rail';
  return (
    <article
      className={cn(
        'group relative flex flex-col hover:opacity-90',
        rail ? 'w-[280px] flex-none gap-2.5' : 'gap-3',
      )}
    >
      <Cover
        tone={e.coverTone}
        imageUrl={e.coverImageUrl}
        className={rail ? 'h-[170px]' : 'aspect-[4/3]'}
      >
        <div className="absolute top-3 left-3 flex min-w-11 flex-col gap-[3px] rounded-md bg-card-date px-2.5 py-1.5 leading-none text-fg">
          <span className="text-[10px] font-extrabold tracking-[0.12em] text-accent-text uppercase">
            {rail ? formatWeekday(e.startsAt) : formatMonth(e.startsAt)}
          </span>
          <span className="text-[22px] font-extrabold">{formatDayNumber(e.startsAt)}</span>
        </div>
      </Cover>
      <SaveButton eventId={e.id} title={e.title} className="absolute top-3 right-3 z-10" />

      <div className="flex flex-col gap-1">
        {!rail && (
          <span className="text-[11px] font-extrabold tracking-[0.1em] text-accent-text uppercase">
            {e.category} · {e.city}
          </span>
        )}
        <h3
          className={cn(
            'm-0 leading-[1.2] font-extrabold tracking-[-0.01em] text-pretty',
            rail ? 'text-[17px]' : 'text-lg',
          )}
        >
          {/* The link covers the whole card; the Save button sits above it. */}
          <Link
            to={`/e/${e.slug}`}
            className="text-fg no-underline after:absolute after:inset-0 hover:text-fg"
          >
            {e.title}
          </Link>
        </h3>
        <span className="text-[13px] text-muted">
          {rail ? formatTimeRange(e.startsAt, e.endsAt) : formatDate(e.startsAt)} · {e.venue}
        </span>
        <span
          className={cn(
            'font-extrabold',
            rail ? 'text-sm' : 'mt-1 text-[15px]',
            isFreeEvent(e) ? 'text-accent-text' : 'text-fg',
          )}
        >
          {priceLabel(e)}
        </span>
      </div>
    </article>
  );
}

export function EventCardSkeleton({ variant = 'grid' }: { variant?: 'rail' | 'grid' }) {
  const rail = variant === 'rail';
  return (
    <div
      aria-hidden
      className={cn('flex animate-pulse flex-col gap-3', rail && 'w-[280px] flex-none')}
    >
      <div className={cn('rounded-2xl bg-surface-2', rail ? 'h-[170px]' : 'aspect-[4/3]')} />
      <div className="h-4 w-3/4 rounded bg-surface-2" />
      <div className="h-3 w-1/2 rounded bg-surface-2" />
    </div>
  );
}
