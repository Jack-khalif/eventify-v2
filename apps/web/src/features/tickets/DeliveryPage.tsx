import { formatDate, formatTimeRange, ticketSms } from '@eventify/shared';
import { useParams } from 'react-router';
import { BackLink } from '../../components/BackLink';
import { QrCode } from '../../components/QrCode';
import { ErrorState, NotFoundState } from '../../components/PageStates';
import { Cover } from '../../components/ui';
import { isNotFound } from '../../lib/api';
import { displayUrl, siteUrl } from '../../lib/site';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { directionsUrl } from '../event/calendar';
import { ticketLine } from './ticketLine';
import { useTicket } from './useTickets';

/** /t/:ticketId/delivery: what the buyer received by SMS and email, as in the design. */
export function DeliveryPage() {
  const { ticketId = '' } = useParams();
  const query = useTicket(ticketId);
  useDocumentTitle('Ticket delivery');

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
  const sms = ticketSms({
    name: t.holderName,
    eventTitle: e.title,
    startsAt: e.startsAt,
    code: t.code,
    passUrl: displayUrl(siteUrl(`/t/${t.id}`)),
  });

  return (
    <section className="mx-auto flex w-full max-w-[1000px] flex-1 flex-col gap-6 px-5 pt-4 pb-12">
      <BackLink label="Your pass" fallback={`/t/${t.id}`} />
      <h1 className="m-0 text-[26px] tracking-[-0.02em]">Ticket delivery</h1>
      <div className="flex flex-wrap items-start gap-8">
        <figure className="m-0 flex max-w-[340px] flex-[1_1_300px] flex-col gap-2.5">
          <figcaption className="text-[13px] font-bold text-muted">SMS confirmation</figcaption>
          <div className="flex flex-col gap-2 rounded-[20px] border-2 border-rule bg-surface p-4">
            <span className="text-[11px] font-extrabold tracking-[0.08em] text-muted">
              EVENTIFY
            </span>
            <p
              data-testid="sms-preview"
              className="m-0 rounded-xl bg-bg px-3.5 py-3 text-[13px] leading-[1.55] break-words"
            >
              {sms}
            </p>
          </div>
        </figure>

        <figure className="m-0 flex max-w-[460px] flex-[1_1_380px] flex-col gap-2.5">
          <figcaption className="text-[13px] font-bold text-muted">Email ticket</figcaption>
          <div className="overflow-hidden rounded-2xl border-2 border-rule bg-bg">
            <div className="flex items-center gap-2 border-b-2 border-rule px-4 py-3">
              <img src="/eventify-mark.png" alt="" className="h-[13px] w-6" />
              <span className="text-xs font-extrabold tracking-[0.14em]">EVENTIFY</span>
            </div>
            <Cover
              tone={e.coverTone}
              imageUrl={e.coverImageUrl}
              className="aspect-[16/8] rounded-none"
            />
            <div className="flex flex-col gap-2.5 p-4">
              <span className="text-base font-extrabold">{e.title}</span>
              <span className="text-[13px] text-muted">
                {formatDate(e.startsAt)} · {formatTimeRange(e.startsAt, e.endsAt)}
                <br />
                <br />
                {e.venue} —{' '}
                <a href={directionsUrl(e)} target="_blank" rel="noopener noreferrer">
                  view map
                </a>
              </span>
              <div className="flex items-center gap-3.5 rounded-xl bg-surface p-3">
                <QrCode
                  value={t.qrPayload}
                  size={70}
                  label={`QR code for ${t.code}`}
                  className="flex-none"
                />
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted">Ticket code</span>
                  <span className="font-mono text-sm font-extrabold">{t.code}</span>
                  <span className="text-xs text-muted">{ticketLine(t)}</span>
                </div>
              </div>
            </div>
          </div>
        </figure>
      </div>
    </section>
  );
}
