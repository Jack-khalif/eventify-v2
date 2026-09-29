import { formatDate, formatTimeRange } from '@eventify/shared';
import { Link, useParams } from 'react-router';
import { BackLink } from '../../components/BackLink';
import { ErrorState, NotFoundState } from '../../components/PageStates';
import { isNotFound } from '../../lib/api';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { directionsUrl } from '../event/calendar';
import { LivePass } from './LivePass';
import { PassActions } from './PassActions';
import { useTicket } from './useTickets';

/** /t/:ticketId: the link in the SMS and email. Shows the Live Pass for one ticket. */
export function TicketPage() {
  const { ticketId = '' } = useParams();
  const query = useTicket(ticketId);
  useDocumentTitle(query.data ? `Ticket · ${query.data.event.title}` : 'Ticket');

  if (query.isPending)
    return <div aria-busy="true" aria-label="Loading ticket" className="flex-1" />;
  if (isNotFound(query.error)) {
    return (
      <NotFoundState
        title="Ticket not found"
        message="Check the link in your SMS or email, or find your tickets with your phone number."
      />
    );
  }
  if (query.isError) {
    return <ErrorState onRetry={query.refetch}>Couldn't load your ticket.</ErrorState>;
  }

  const t = query.data;
  const e = t.event;
  return (
    <section className="mx-auto flex w-full max-w-[520px] flex-1 flex-col items-center gap-[18px] px-5 pt-4 pb-10">
      <div className="self-start">
        <BackLink label="Tickets" fallback="/tickets" />
      </div>
      <div className="flex flex-col gap-1 text-center">
        <h1 className="m-0 text-[26px] tracking-[-0.02em]">{e.title}</h1>
        <span className="text-[13px] text-muted">
          {formatDate(e.startsAt)} · {formatTimeRange(e.startsAt, e.endsAt)} ·{' '}
          <a href={directionsUrl(e)} target="_blank" rel="noopener noreferrer">
            {e.venue}
          </a>
        </span>
      </div>
      <LivePass ticket={t} />
      <PassActions event={e} />
      <p className="m-0 max-w-[360px] text-center text-xs text-muted">
        Keep this link to yourself: anyone who has it can use your ticket.
      </p>
      <Link to={`/t/${t.id}/delivery`} className="text-[13px] font-bold text-accent-text">
        Preview the SMS &amp; email →
      </Link>
      <Link to={`/e/${e.slug}`} className="text-[13px] text-muted">
        Event details
      </Link>
    </section>
  );
}
