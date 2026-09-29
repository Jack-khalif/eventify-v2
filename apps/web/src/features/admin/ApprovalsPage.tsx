import { APPROVAL_FLOOR_BPS, formatDate, formatRate } from '@eventify/shared';
import { Link } from 'react-router';
import { Button, Card } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { AdminPage } from './AdminLayout';
import { QueryView } from './QueryView';
import { useApprovals, useResolveApproval } from './useAdmin';

export function ApprovalsPage() {
  useDocumentTitle('Approvals');
  const query = useApprovals();
  const resolve = useResolveApproval();
  const busy = resolve.isPending ? resolve.variables?.id : undefined;

  return (
    <AdminPage title="Approvals queue" width="max-w-[1100px]">
      <p className="-mt-2 m-0 text-sm text-muted">
        Agent requests below the {formatRate(APPROVAL_FLOOR_BPS)} floor need Super Admin sign-off
        before they apply.
      </p>
      {resolve.error && (
        <p
          role="alert"
          className="m-0 rounded-xl bg-danger-soft p-3.5 text-sm font-semibold text-danger"
        >
          {resolve.error instanceof ApiError ? resolve.error.message : "Couldn't save. Try again."}
        </p>
      )}
      <QueryView query={query} label="approvals">
        {(rows) =>
          rows.length === 0 ? (
            <Card className="p-5 text-sm">
              Nothing pending. Requests below {formatRate(APPROVAL_FLOOR_BPS)} will show up here.
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
