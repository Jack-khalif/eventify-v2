import { formatDate, formatTime, maskPhone } from '@eventify/shared';
import { Printer } from 'lucide-react';
import { useParams } from 'react-router';
import { BackLink } from '../../components/BackLink';
import { ErrorState, NotFoundState } from '../../components/PageStates';
import { Button } from '../../components/ui';
import { isNotFound } from '../../lib/api';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { SignedIn } from '../auth/guards';
import { useAttendees } from './useDashboard';

/**
 * /organizer/events/:id/guest-list: the guest list laid out for paper, with a box to tick per
 * ticket. "Print" also saves it as a PDF. Phone numbers are cut to their last digits: printed
 * sheets get left on tables.
 */
export function GuestListPrintPage() {
  return <SignedIn>{() => <PrintableList />}</SignedIn>;
}

function PrintableList() {
  const { id = '' } = useParams();
  const query = useAttendees(id);
  useDocumentTitle(query.data ? `Guest list · ${query.data.event.title}` : 'Guest list');

  if (query.isPending) {
    return <div aria-busy="true" aria-label="Loading guest list" className="flex-1" />;
  }
  if (isNotFound(query.error)) {
    return <NotFoundState title="Event not found" message="It may have been deleted." />;
  }
  if (query.isError) {
    return <ErrorState onRetry={query.refetch}>Couldn't load the guest list.</ErrorState>;
  }

  const { event, attendees } = query.data;
  const printedAt = new Date().toISOString();
  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-4 bg-bg px-5 pt-4 pb-12 text-fg print:max-w-none print:bg-white print:p-0 print:text-black">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <BackLink label="Dashboard" fallback={`/organizer?event=${encodeURIComponent(event.id)}`} />
        <Button size="sm" onClick={() => window.print()}>
          <Printer size={15} aria-hidden /> Print or save as PDF
        </Button>
      </div>
      <header className="flex flex-col gap-0.5">
        <h1 className="m-0 text-2xl">{event.title}</h1>
        <span className="text-sm">
          {formatDate(event.startsAt)} · {formatTime(event.startsAt)} · {event.venue}
        </span>
        <span className="text-xs text-muted print:text-black">
          {attendees.length} {attendees.length === 1 ? 'ticket' : 'tickets'} · printed{' '}
          {formatDate(printedAt)} at {formatTime(printedAt)} · tick each guest as they come in
        </span>
      </header>
      {attendees.length === 0 ? (
        <p className="m-0 text-muted">Nobody has a ticket yet.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-rule text-left text-xs print:border-black">
              <th scope="col" className="w-10 py-2 pr-2 font-semibold">
                In
              </th>
              <th scope="col" className="py-2 pr-2 font-semibold">
                Name
              </th>
              <th scope="col" className="py-2 pr-2 font-semibold">
                Ticket
              </th>
              <th scope="col" className="py-2 pr-2 font-semibold">
                Tier
              </th>
              <th scope="col" className="py-2 font-semibold">
                Phone
              </th>
            </tr>
          </thead>
          <tbody>
            {attendees.map((a) => (
              <tr
                key={a.ticketId}
                className="break-inside-avoid border-b border-hair print:border-neutral-400"
              >
                <td className="py-2 pr-2">
                  {a.checkedInAt ? (
                    <span title={`Checked in ${formatTime(a.checkedInAt)}`}>✓</span>
                  ) : (
                    <span
                      aria-label="Not checked in"
                      className="inline-block size-4 rounded-sm border-2 border-rule print:border-black"
                    />
                  )}
                </td>
                <td className="py-2 pr-2 font-semibold">
                  {a.name}
                  {a.kind === 'comp' && <span className="font-normal text-muted"> (guest)</span>}
                </td>
                <td className="py-2 pr-2 font-mono text-xs">{a.code}</td>
                <td className="py-2 pr-2">{a.tierName}</td>
                <td className="py-2 font-mono text-xs whitespace-nowrap">{maskPhone(a.phone)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
