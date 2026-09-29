import { formatDate } from '@eventify/shared';
import { cn } from '../lib/cn';

const DAY_MS = 24 * 60 * 60 * 1000;

type BarChartProps = {
  /** One value per day, oldest first, ending today. */
  daily: number[];
  /** "24 tickets", "KSh 12,400". */
  format: (value: number) => string;
  /** Table caption for screen readers, e.g. "Tickets sold per day". */
  caption: string;
  /** Column header for the values. */
  valueLabel: string;
  empty: string;
  now?: Date;
};

/**
 * Daily bars ending today. One series, so no legend: the card title names it.
 * Hovering a bar shows its day and value; screen readers get the same numbers as a table.
 */
export function BarChart({
  daily,
  format,
  caption,
  valueLabel,
  empty,
  now = new Date(),
}: BarChartProps) {
  const max = Math.max(...daily, 1);
  const days = daily.map((count, i) => ({
    count,
    label: formatDate(new Date(now.getTime() - (daily.length - 1 - i) * DAY_MS).toISOString()),
  }));

  if (daily.every((n) => n === 0)) {
    return (
      <p className="m-0 flex h-40 items-center justify-center rounded-lg bg-surface text-sm text-muted">
        {empty}
      </p>
    );
  }

  return (
    <>
      <div aria-hidden className="flex h-40 items-end border-b-2 border-hair">
        {days.map((d, i) => {
          const last = i === days.length - 1;
          return (
            <div key={i} className="group relative flex h-full flex-1 items-end justify-center">
              {d.count > 0 && (
                <div
                  className={cn(
                    'w-[64%] rounded-t-[4px] group-hover:opacity-80',
                    last ? 'bg-accent-text' : 'bg-accent',
                  )}
                  style={{ height: `${(d.count / max) * 84}%` }}
                />
              )}
              <span className="pointer-events-none absolute bottom-full z-10 mb-1 hidden rounded-md bg-fg px-2 py-1 text-xs font-bold whitespace-nowrap text-bg group-hover:block">
                {d.label} · {format(d.count)}
              </span>
            </div>
          );
        })}
      </div>
      <div aria-hidden className="flex justify-between text-xs text-muted">
        <span>{days[0]!.label}</span>
        <span>Today</span>
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">{valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.label}>
              <td>{d.label}</td>
              <td>{format(d.count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
