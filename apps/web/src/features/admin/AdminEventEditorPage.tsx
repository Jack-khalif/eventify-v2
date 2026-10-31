import { Link, useParams } from 'react-router';
import { EventEditor } from '../create-event/CreateEventPage';
import { useAdminEvent, useAdminMe } from './useAdmin';

export function AdminEventEditorPage() {
  const { id } = useParams();
  const me = useAdminMe();
  const isSuper = me.data?.role === 'super_admin';
  const event = useAdminEvent(id, isSuper);

  if (me.isPending || (isSuper && event.isPending)) {
    return <div aria-busy="true" aria-label="Loading event" className="flex-1" />;
  }

  if (!isSuper) {
    return (
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5 px-5 pt-5 pb-12">
        <Link to="/admin/organizers" className="text-sm font-bold">
          Back to organizers
        </Link>
        <p role="alert" className="m-0 text-sm text-danger">
          Only a Super Admin can edit organizer events.
        </p>
      </div>
    );
  }

  if (event.isError || !event.data) {
    return (
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5 px-5 pt-5 pb-12">
        <Link to="/admin/organizers" className="text-sm font-bold">
          Back to organizers
        </Link>
        <p role="alert" className="m-0 text-sm text-danger">
          Couldn't load this event to edit it.
        </p>
      </div>
    );
  }

  return <EventEditor key={event.data.id} event={event.data} admin />;
}
