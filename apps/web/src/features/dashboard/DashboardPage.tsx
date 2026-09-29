import {
  formatDate,
  formatMoney,
  formatRate,
  lastDays,
  organizerNetFor,
  feeFor,
  type EventDashboard,
  type EventStatus,
  type OrganizerHome,
} from '@eventify/shared';
import { Copy } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { BarChart } from '../../components/BarChart';
import { ErrorState } from '../../components/PageStates';
import { Button, buttonClass, Card, Cover, Tag } from '../../components/ui';
import { cn } from '../../lib/cn';
import { displayUrl, siteUrl } from '../../lib/site';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { useEventDashboard, useOrganizerHome } from './useDashboard';

const STATUS_LABEL: Record<EventStatus, string> = { live: 'Live', draft: 'Draft', ended: 'Ended' };
const count = (n: number) => n.toLocaleString('en-US');

export function DashboardPage() {
  useDocumentTitle('Dashboard');
  const home = useOrganizerHome();

  if (home.isPending) {
    return <div aria-busy="true" aria-label="Loading dashboard" className="flex-1" />;
  }
  if (home.isError) {
    return <ErrorState onRetry={home.refetch}>Couldn't load your dashboard.</ErrorState>;
  }
  return <Dashboard home={home.data} />;
}

function Dashboard({ home }: { home: OrganizerHome }) {
  const [params, setParams] = useSearchParams();
  const events = home.events;
  // The chosen event, else the next one still on sale, else the most recent.
  const selected =
    events.find((e) => e.id === params.get('event')) ??
    events.find((e) => e.status === 'live') ??
    events.at(-1);
  const dashboard = useEventDashboard(selected?.id);

  const select = (id: string) => {
    setParams({ event: id }, { replace: true });
    window.scrollTo?.({ top: 0, behavior: 'smooth' });
  };

  const myEvents = (
    <section aria-labelledby="my-events" className="flex min-w-0 flex-[1_1_320px] flex-col gap-3">
      <h2 id="my-events" className="m-0 text-lg">
        My events
      </h2>
      <ul className="m-0 flex list-none flex-col border-t-2 border-rule p-0">
        {events.map((e) => {
          const current = e.id === selected?.id;
          return (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => select(e.id)}
                aria-current={current ? 'true' : undefined}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-3.5 border-b-2 border-hair px-1 py-3 text-left hover:bg-surface',
                  current && 'bg-surface',
                )}
              >
                <Cover
                  tone={e.coverTone}
                  imageUrl={e.coverImageUrl}
                  className="size-12 flex-none rounded-[10px]"
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-extrabold">{e.title}</span>
                  <span className="text-xs text-muted">
                    {formatDate(e.startsAt)} · {count(e.ticketsSold)} sold
                  </span>
                </span>
                <Tag
                  tone={e.status === 'live' ? 'accent' : 'neutral'}
                  className="px-2.5 text-[10px] tracking-[0.06em] uppercase"
                >
                  {STATUS_LABEL[e.status]}
                </Tag>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-6 px-5 pt-5 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="m-0 text-[28px] tracking-[-0.02em]">Dashboard</h1>
          <span className="text-sm text-muted">{home.organizer.name}</span>
        </div>
        <Link
          to="/organizer/events/new"
          className={buttonClass({ className: 'text-accent-ink hover:text-accent-ink' })}
        >
          + Create event
        </Link>
      </div>

      {!selected ? (
        <Card className="flex flex-col items-start gap-3 p-6">
          <h2 className="m-0 text-xl">No events yet</h2>
          <p className="m-0 text-muted">
            Create your first event and its sales and check-ins will show up here.
          </p>
        </Card>
      ) : dashboard.isError ? (
        <ErrorState onRetry={dashboard.refetch}>Couldn't load numbers for this event.</ErrorState>
      ) : !dashboard.data ? (
        <div aria-busy="true" aria-label="Loading event numbers" className="h-64" />
      ) : (
        <EventNumbers d={dashboard.data} myEvents={myEvents} />
      )}
    </div>
  );
}

function EventNumbers({ d, myEvents }: { d: EventDashboard; myEvents: ReactNode }) {
  const fees = feeFor(d.grossMinor, d.rateBps);
  const soldThisWeek = lastDays(d.dailySales, 7);
  const soldIn14 = lastDays(d.dailySales, 14);
  const stats = [
    { label: 'Tickets sold', value: count(d.ticketsSold), sub: `+${soldThisWeek} this week` },
    { label: 'Gross sales', value: formatMoney(d.currency, d.grossMinor), sub: 'Before fees' },
    {
      label: 'Eventify fees',
      value: formatMoney(d.currency, fees),
      sub: `${formatRate(d.rateBps)} rate`,
    },
    {
      label: 'Net payout',
      value: formatMoney(d.currency, organizerNetFor(d.grossMinor, d.rateBps)),
      sub: 'Paid out weekly',
    },
    {
      label: 'Check-ins',
      value: count(d.checkIns),
      sub: d.ticketsSold
        ? `${Math.round((d.checkIns / d.ticketsSold) * 100)}% of sold`
        : 'None sold yet',
    },
    {
      label: 'Page views',
      value: count(d.pageViews),
      sub: `+${count(d.pageViewsThisWeek)} this week`,
    },
  ];
  const topTier = Math.max(...d.tierSales.map((t) => t.sold), 1);

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="m-0 text-xl">{d.title}</h2>
        <Link to={`/e/${d.slug}`} className="text-sm font-bold">
          View event page
        </Link>
      </div>

      <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="flex flex-col gap-1.5 p-4">
            <dt className="text-xs font-semibold text-muted">{s.label}</dt>
            <dd className="m-0 text-2xl font-extrabold tracking-[-0.02em]">{s.value}</dd>
            <dd className="m-0 text-[11px] font-bold text-accent-text">{s.sub}</dd>
          </Card>
        ))}
      </dl>

      <div className="flex flex-wrap gap-5">
        <Card className="flex min-w-0 flex-[2_1_380px] flex-col gap-3.5 p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="m-0 text-base">Ticket sales, last 14 days</h3>
            <span className="text-[13px] text-muted">{count(soldIn14)} tickets</span>
          </div>
          <BarChart
            daily={d.dailySales}
            format={(n) => `${n} ${n === 1 ? 'ticket' : 'tickets'}`}
            caption="Tickets sold per day"
            valueLabel="Tickets"
            empty="No sales in the last 14 days yet."
          />
        </Card>

        <Card className="flex flex-[1_1_260px] flex-col gap-3 p-5">
          <h3 className="m-0 text-base">Sales by tier</h3>
          {d.ticketsSold === 0 ? (
            <p className="m-0 text-sm text-muted">No tickets sold yet.</p>
          ) : (
            d.tierSales.map((t) => (
              <div key={t.name} className="flex flex-col gap-1">
                <div className="flex justify-between gap-2 text-[13px]">
                  <span className="font-bold">{t.name}</span>
                  <span className="text-muted">
                    {count(t.sold)} sold · {formatMoney(d.currency, t.revenueMinor)}
                  </span>
                </div>
                <div aria-hidden className="h-2 overflow-hidden rounded bg-surface-2">
                  <div
                    className="h-full bg-accent"
                    style={{ width: `${(t.sold / topTier) * 100}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </Card>
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <CheckIns d={d} />
        {myEvents}
      </div>
    </>
  );
}

function CheckIns({ d }: { d: EventDashboard }) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const link = siteUrl(`/checkin/${d.checkinCode}`);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Clipboard can be blocked; the link is visible to copy by hand.
    }
  };

  return (
    <Card className="flex min-w-0 flex-[1_1_320px] flex-col gap-3 p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="m-0 text-base">Live check-ins</h3>
        <span className="text-[13px] font-extrabold text-accent-text">
          {count(d.checkIns)} / {count(d.ticketsSold)} checked in
        </span>
      </div>
      {d.doors.length === 0 ? (
        <p className="m-0 text-sm text-muted">
          No check-ins yet. Invite door staff and they can scan from their phones.
        </p>
      ) : (
        <ul className="m-0 list-none p-0">
          {d.doors.map((door) => (
            <li
              key={door.doorId}
              className="flex items-center justify-between border-b border-hair py-2.5 text-sm"
            >
              <span className="font-semibold">{door.name}</span>
              <span className="font-extrabold">{count(door.count)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1 flex flex-wrap gap-2.5">
        <Button
          variant="outline"
          size="sm"
          aria-expanded={inviteOpen}
          onClick={() => setInviteOpen((o) => !o)}
        >
          Invite door staff
        </Button>
        <Link
          to={`/checkin/${d.checkinCode}`}
          className={buttonClass({
            size: 'sm',
            className: 'bg-fg text-bg hover:bg-fg hover:text-bg hover:opacity-85',
          })}
        >
          Preview scanner
        </Link>
      </div>
      {inviteOpen && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 rounded-lg border-2 border-hair py-1.5 pr-1.5 pl-3">
            <span
              className="min-w-0 flex-1 truncate text-[13px] font-semibold"
              data-testid="door-link"
            >
              {displayUrl(link)}
            </span>
            <button
              type="button"
              onClick={copy}
              className="inline-flex flex-none cursor-pointer items-center gap-1.5 rounded-[8px] bg-fg px-3 py-1.5 text-xs font-extrabold text-bg hover:opacity-85"
            >
              <Copy size={13} aria-hidden />
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <span className="text-xs text-muted">
            Send this to anyone working the door. It opens the scanner for this event only.
          </span>
        </div>
      )}
    </Card>
  );
}
