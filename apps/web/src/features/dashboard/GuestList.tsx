import { attendeesCsv, formatDate, formatTime, type AttendeeList } from '@eventify/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Download, Printer } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button, buttonClass, Card } from '../../components/ui';
import { useAttendees } from './useDashboard';

/** Save text as a file on this device. */
function saveFile(name: string, type: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

const guestListFileName = (list: AttendeeList) => `${list.event.slug}-guest-list.csv`;

/** Download the guest list as a spreadsheet, or open a page to print and tick off at the door. */
export function GuestList({ eventId, issued }: { eventId: string; issued: number }) {
  const queryClient = useQueryClient();
  const attendees = useAttendees(eventId, { enabled: false });
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setError(null);
    try {
      const { data, error: failed } = await attendees.refetch();
      if (!data) throw failed;
      const csv = attendeesCsv(data.attendees, (at) => `${formatDate(at)} ${formatTime(at)}`);
      saveFile(guestListFileName(data), 'text/csv;charset=utf-8', csv);
    } catch {
      setError("Couldn't download the guest list. Try again.");
    } finally {
      void queryClient.invalidateQueries({ queryKey: ['my-organizer', 'attendees', eventId] });
    }
  };

  return (
    <Card className="flex min-w-0 flex-[1_1_320px] flex-col gap-3 p-5">
      <h3 className="m-0 text-base">Guest list</h3>
      <p className="m-0 text-sm text-muted">
        Everyone with a ticket, by name. Open it in Excel or Google Sheets, or print it to tick
        names off at the door if phones or signal let you down.
      </p>
      {issued === 0 ? (
        <p className="m-0 text-sm text-muted">Nobody has a ticket yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2.5">
          <Button variant="outline" size="sm" onClick={download} disabled={attendees.isFetching}>
            <Download size={15} aria-hidden />
            {attendees.isFetching ? 'Preparing…' : 'Download spreadsheet'}
          </Button>
          <Link
            to={`/organizer/events/${encodeURIComponent(eventId)}/guest-list`}
            className={buttonClass({ variant: 'outline', size: 'sm', className: 'text-fg' })}
          >
            <Printer size={15} aria-hidden /> Print door list
          </Link>
        </div>
      )}
      {error && (
        <p role="alert" className="m-0 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </Card>
  );
}
