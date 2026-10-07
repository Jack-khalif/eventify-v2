import {
  APPROVAL_FLOOR_BPS,
  formatDate,
  formatPhone,
  formatRate,
  type AdminApplicationRow,
} from '@eventify/shared';
import { Link } from 'react-router';
import { Button, Card, Tag } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { AdminPage } from './AdminLayout';
import { QueryView } from './QueryView';
import {
  useApplications,
  useApprovals,
  useResolveApproval,
  useSetOrganizerStatus,
} from './useAdmin';

export function ApprovalsPage() {
  useDocumentTitle('Approvals');
  const query = useApprovals();
  const resolve = useResolveApproval();
  const busy = resolve.isPending ? resolve.variables?.id : undefined;

  return (
    <AdminPage title="Approvals queue" width="max-w-[1100px]">
      <Applications />

      <div className="mt-3 flex flex-col gap-1">
        <h2 className="m-0 text-lg">Rate requests</h2>
        <p className="m-0 text-sm text-muted">
          Agent requests below the {formatRate(APPROVAL_FLOOR_BPS)} floor need Super Admin sign-off
          before they apply.
        </p>
      </div>
      {resolve.error && (
        <p
          role="alert"
          className="m-0 rounded-xl bg-danger-soft p-3.5 text-sm font-semibold text-danger"
        >
          {resolve.error instanceof ApiError ? resolve.error.message : "Couldn't save. Try again."}
        </p>
      )}
      <QueryView query={query} label="rate requests">
        {(rows) =>
          rows.length === 0 ? (
            <Card className="p-5 text-sm">
              No rate requests. Requests below {formatRate(APPROVAL_FLOOR_BPS)} will show up here.
            </Card>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {rows.map((a) => (
                <li key={a.id}>
                  <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
                    <div className="flex min-w-[220px] flex-col gap-1">
                      <Link
                        to={`/admin/organizers/${a.handle}`}
                        className="text-[15px] font-bold text-fg no-underline hover:text-accent-text"
                      >
                        {a.organizerName}
                      </Link>
                      <span className="text-xs text-muted">
                        Requested by {a.agentName} · {formatDate(a.requestedAt)}
                        {a.eventTitle && ` · ${a.eventTitle} only`}
                      </span>
                      <span className="text-[13px]">{a.reason}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm text-muted">
                        {formatRate(a.currentBps)} →{' '}
                        <strong className="text-[22px] text-accent-text">
                          {formatRate(a.requestedBps)}
                        </strong>
                      </span>
                      <Button
                        size="sm"
                        disabled={busy === a.id}
                        onClick={() => resolve.mutate({ id: a.id, decision: 'approve' })}
                        aria-label={`Approve ${formatRate(a.requestedBps)} for ${a.organizerName}`}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy === a.id}
                        onClick={() => resolve.mutate({ id: a.id, decision: 'reject' })}
                        aria-label={`Reject ${formatRate(a.requestedBps)} for ${a.organizerName}`}
                      >
                        Reject
                      </Button>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )
        }
      </QueryView>
    </AdminPage>
  );
}

/** Organizers who applied to host. Nobody can publish until one of these is approved. */
function Applications() {
  const query = useApplications();
  const setStatus = useSetOrganizerStatus();
  const busy = setStatus.isPending ? setStatus.variables?.handle : undefined;

  return (
    <section aria-labelledby="applications" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="applications" className="m-0 text-lg">
          Organizer applications
        </h2>
        <p className="m-0 text-sm text-muted">
          New organizers can't publish events until a Super Admin approves them.
        </p>
      </div>
      {setStatus.error && (
        <p
          role="alert"
          className="m-0 rounded-xl bg-danger-soft p-3.5 text-sm font-semibold text-danger"
        >
          {setStatus.error instanceof ApiError
            ? setStatus.error.message
            : "Couldn't save. Try again."}
        </p>
      )}
      <QueryView query={query} label="applications">
        {(rows) =>
          rows.length === 0 ? (
            <Card className="p-5 text-sm">No applications waiting.</Card>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {rows.map((a) => (
                <li key={a.organizerId}>
                  <Application
                    a={a}
                    busy={busy === a.handle}
                    onDecide={(status) => setStatus.mutate({ handle: a.handle, status })}
                  />
                </li>
              ))}
            </ul>
          )
        }
      </QueryView>
    </section>
  );
}

function Application({
  a,
  busy,
  onDecide,
}: {
  a: AdminApplicationRow;
  busy: boolean;
  onDecide: (status: 'active' | 'rejected') => void;
}) {
  return (
    <Card className="flex flex-wrap items-start justify-between gap-4 p-5">
      <div className="flex min-w-[240px] flex-[1_1_420px] flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/admin/organizers/${a.handle}`}
            className="text-[15px] font-bold text-fg no-underline hover:text-accent-text"
          >
            {a.name}
          </Link>
          <Tag tone="outline">{a.type}</Tag>
        </div>
        <span className="text-xs text-muted">
          {a.category} · {a.city} · applied {formatDate(a.appliedAt)}
          {a.agent && ` · onboarded by ${a.agent.name}`}
        </span>
        <p className="m-0 text-[13px]">{a.about}</p>
        <span className="text-xs text-muted">
          {a.contactName} · <span className="whitespace-nowrap">{formatPhone(a.phone)}</span>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <Button
          size="sm"
          disabled={busy}
          onClick={() => onDecide('active')}
          aria-label={`Approve ${a.name} as an organizer`}
        >
          Approve
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => onDecide('rejected')}
          aria-label={`Decline ${a.name}`}
        >
          Decline
        </Button>
      </div>
    </Card>
  );
}
