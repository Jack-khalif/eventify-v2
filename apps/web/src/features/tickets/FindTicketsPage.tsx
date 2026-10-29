import { formatDate, type TicketView } from '@eventify/shared';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Cover, Tag } from '../../components/ui';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { useSession } from '../auth/useSession';
import { ticketLine } from './ticketLine';
import { useMyTickets } from './useTickets';

/**
 * /tickets: email remains the supported delivery channel. Guests are asked to sign in so the
 * confirmation email can be used to find the passes they bought.
 */
export function FindTicketsPage() {
  useDocumentTitle('Your tickets');
  const { user } = useSession();
  const mine = useMyTickets({ enabled: !!user });

  return (
    <section className="mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-6 px-5 pt-6 pb-12">
      <h1 className="m-0 text-[28px] tracking-[-0.02em]">Your tickets</h1>
      {!user ? (
        <div className="flex flex-col gap-4 rounded-2xl border-2 border-rule bg-surface p-5">
          <p className="m-0 text-[15px] text-muted">
            Tickets are delivered by email. Sign in to your Eventify account to see the passes you
            bought, or use the confirmation link in your email.
          </p>
          <Link to="/account" className="text-sm font-bold text-accent-text">
            Sign in
          </Link>
        </div>
      ) : mine.data ? (
        <TicketList owner={user.email} tickets={mine.data} empty={{
          title: 'No tickets for this email',
          body: 'Tickets show here when this email was entered at checkout.',
        }} />
      ) : mine.isError ? (
        <p role="alert" className="m-0 text-sm text-danger">
          Couldn't load your tickets.{' '}
          <button
            type="button"
            onClick={() => mine.refetch()}
            className="cursor-pointer font-bold underline underline-offset-3"
          >
            Retry
          </button>
        </p>
      ) : (
        <div aria-busy="true" aria-label="Loading your tickets" className="h-40" />
      )}
    </section>
  );
}

function TicketList({
  owner,
  tickets,
  empty,
}: {
  owner: string;
  tickets: TicketView[];
  empty: { title: string; body: string };
}) {
  const [now] = useState(() => Date.now());

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-[15px] text-muted">
        Tickets for <strong className="break-all text-fg">{owner}</strong>
      </p>
      {tickets.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl border-2 border-hair p-5">
          <span className="font-extrabold">{empty.title}</span>
          <span className="text-sm text-muted">{empty.body}</span>
          <Link to="/discover" className="text-sm font-bold">
            Find events
          </Link>
        </div>
      ) : (
        <ul aria-label="Tickets" className="m-0 flex list-none flex-col gap-3 p-0">
          {tickets.map((t) => {
            const ended = Date.parse(t.event.endsAt) < now;
            return (
              <li key={t.id}>
                <Link
                  to={`/t/${t.id}`}
                  className="flex items-center gap-3.5 rounded-2xl border-2 border-rule p-3 text-fg no-underline hover:bg-surface"
                >
                  <Cover
                    tone={t.event.coverTone}
                    imageUrl={t.event.coverImageUrl}
                    className={`size-16 flex-none rounded-lg ${ended ? 'opacity-50' : ''}`}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-extrabold">{t.event.title}</span>
                    <span className="text-[13px] text-muted">
                      {formatDate(t.event.startsAt)} · {ticketLine(t)}
                    </span>
                    <span className="font-mono text-xs text-muted">{t.code}</span>
                  </span>
                  {t.checkedInAt ? (
                    <Tag tone="good">Checked in</Tag>
                  ) : ended ? (
                    <Tag tone="neutral">Ended</Tag>
                  ) : null}
                  <ChevronRight size={18} className="flex-none text-muted" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
