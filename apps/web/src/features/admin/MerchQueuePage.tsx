import {
  formatDate,
  MERCH_STATUSES,
  merchStatusChangeSchema,
  type AdminMerchRow,
  type MerchStatus,
} from '@eventify/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Button, Card, Dialog, SelectField, Tag, TextAreaField } from '../../components/ui';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { AdminPage } from './AdminLayout';
import { MERCH_STATUS, merchSummary } from './format';
import { QueryView } from './QueryView';
import { useMerchQueue, useSetMerchStatus } from './useAdmin';

/** The print queue: organizers' merch requests, open ones first by event date. */
export function MerchQueuePage() {
  useDocumentTitle('Print queue');
  const query = useMerchQueue();
  const [updating, setUpdating] = useState<AdminMerchRow | null>(null);

  return (
    <AdminPage title="Print queue" width="max-w-[1000px]">
      <p className="-mt-2 m-0 text-sm text-muted">
        Branded merch organizers have asked for. Move each one along as it's quoted, printed and
        handed over; the organizer sees the status and your note on their dashboard.
      </p>
      <QueryView query={query} label="print queue">
        {(rows) =>
          rows.length === 0 ? (
            <p className="m-0 text-muted">No merch requests yet.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {rows.map((r) => (
                <li key={r.id}>
                  <Card className="flex flex-col gap-2 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="font-extrabold">{r.event.title}</span>
                        <span className="text-xs text-muted">
                          Event {formatDate(r.event.startsAt)} ·{' '}
                          <Link
                            to={`/admin/organizers/${r.organizer.handle}`}
                            className="text-muted hover:text-accent-text"
                          >
                            {r.organizer.name}
                          </Link>{' '}
                          · <a href={`mailto:${r.organizer.email}`}>{r.organizer.email}</a>
                        </span>
                      </div>
                      <Tag tone={MERCH_STATUS[r.status].tone}>{MERCH_STATUS[r.status].label}</Tag>
                    </div>
                    <span className="text-sm font-semibold">{merchSummary(r.items)}</span>
                    <p className="m-0 text-sm whitespace-pre-wrap text-muted">{r.brandingNotes}</p>
                    {r.opsNote && (
                      <p className="m-0 rounded-lg bg-surface px-3 py-2 text-[13px]">
                        <span className="font-bold">Note to organizer:</span> {r.opsNote}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-muted">
                        Requested {formatDate(r.createdAt)} · updated {formatDate(r.updatedAt)}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setUpdating(r)}
                        aria-label={`Update ${r.organizer.name}'s request for ${r.event.title}`}
                      >
                        Update
                      </Button>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )
        }
      </QueryView>
      {updating && <StatusDialog request={updating} onClose={() => setUpdating(null)} />}
    </AdminPage>
  );
}

function StatusDialog({ request, onClose }: { request: AdminMerchRow; onClose: () => void }) {
  const [status, setStatus] = useState<MerchStatus>(request.status);
  const [note, setNote] = useState(request.opsNote);
  const save = useSetMerchStatus();

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const parsed = merchStatusChangeSchema.safeParse({ status, note });
    if (!parsed.success) return;
    save.mutate({ id: request.id, ...parsed.data }, { onSuccess: onClose });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${request.organizer.name} · ${request.event.title}`}
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => submit()} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-3">
        <p className="m-0">{merchSummary(request.items)}</p>
        <SelectField
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as MerchStatus)}
        >
          {MERCH_STATUSES.map((s) => (
            <option key={s} value={s}>
              {MERCH_STATUS[s].label}
            </option>
          ))}
        </SelectField>
        <TextAreaField
          label="Note to the organizer"
          placeholder="A quote, when it'll be ready, where to collect it, or why it can't be done"
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          hint="Shown on their dashboard."
        />
        {save.error && (
          <p role="alert" className="m-0 font-semibold text-danger">
            {save.error.message}
          </p>
        )}
      </form>
    </Dialog>
  );
}
