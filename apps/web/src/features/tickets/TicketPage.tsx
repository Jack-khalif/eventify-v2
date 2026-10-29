import { displayStatus, formatDate, formatTimeRange } from '@eventify/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { BackLink } from '../../components/BackLink';
import { ErrorState, NotFoundState } from '../../components/PageStates';
import { PdfTicketButton } from './PdfTicketButton';
import { ApiError, isNotFound, isTransferred } from '../../lib/api';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { directionsUrl } from '../event/calendar';
import { TicketCard } from './TicketCard';
import { PassActions } from './PassActions';
import {
  ResendTransfer,
  TransferDone,
  TransferTicket,
  type TransferOutcome,
} from './TransferTicket';
import { useTicket } from './useTickets';

/** /t/:ticketId: the email link shows a static ticket and downloadable PDF. */
export function TicketPage() {
  const { ticketId = '' } = useParams();
  const query = useTicket(ticketId);
  const [transferred, setTransferred] = useState<TransferOutcome | null>(null);
  useDocumentTitle(query.data ? `Ticket · ${query.data.event.title}` : 'Ticket');

  if (query.isPending)
    return <div aria-busy="true" aria-label="Loading ticket" className="flex-1" />;
  if (isNotFound(query.error)) {
    return (
      <NotFoundState
        title="Ticket not found"
        message="Check the link in your email, or sign in to see your tickets."
      />
    );
  }
  if (isTransferred(query.error) && !transferred) {
    return (
      <section className="mx-auto flex w-full max-w-[520px] flex-col items-start gap-4 px-5 py-12">
        <h1 className="m-0 text-4xl">Ticket transferred</h1>
        <p className="m-0 text-muted">
          {query.error instanceof ApiError ? query.error.message : ''}
        </p>
        <ResendTransfer ticketId={ticketId} />
      </section>
    );
  }
  if (query.isError && !transferred) {
    return <ErrorState onRetry={query.refetch}>Couldn't load your ticket.</ErrorState>;
  }
  if (!query.data) return null;

  const t = query.data;
  const transferable = !t.checkedInAt && displayStatus(t.event) !== 'ended';
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
      {transferred ? (
        <TransferDone result={transferred} />
      ) : (
        <>
          <TicketCard ticket={t} />
          <PdfTicketButton ticket={t} />
          <PassActions event={e} />
          <p className="m-0 max-w-[360px] text-center text-xs text-muted">
            Keep this link to yourself: anyone who has it can use your ticket.
          </p>
          {transferable && <TransferTicket ticket={t} onTransferred={setTransferred} />}
          <Link to={`/t/${t.id}/delivery`} className="text-[13px] font-bold text-accent-text">
            Preview the email ticket →
          </Link>
        </>
      )}
      <Link to={`/e/${e.slug}`} className="text-[13px] text-muted">
        Event details
      </Link>
    </section>
  );
}
