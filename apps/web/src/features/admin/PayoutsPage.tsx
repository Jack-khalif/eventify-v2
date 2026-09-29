import {
  formatDate,
  formatMoney,
  markPaidRequestSchema,
  type AdminPayoutRow,
} from '@eventify/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Button, Card, Dialog, Tag, TextField } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { AdminPage } from './AdminLayout';
import { PAYOUT_METHOD, PAYOUT_STATUS } from './format';
import { QueryView } from './QueryView';
import { useAdminMe, useAdminPayouts, useMarkPaid } from './useAdmin';

export function PayoutsPage() {
  useDocumentTitle('Payouts');
  const query = useAdminPayouts();
  const canPay = useAdminMe().data?.role === 'super_admin';
  const [paying, setPaying] = useState<AdminPayoutRow | null>(null);

  const action = (p: AdminPayoutRow, block = false) =>
    canPay && p.status !== 'paid' ? (
      <Button
        variant="outline"
        size="sm"
        block={block}
        onClick={() => setPaying(p)}
        aria-label={`Mark ${p.organizerName} as paid`}
      >
        Mark as paid
      </Button>
    ) : p.reference ? (
      <span className="font-mono text-xs text-muted">
        Ref {p.reference} · {formatDate(p.paidAt!)}
      </span>
    ) : null;

  return (
    <AdminPage title="Payouts" width="max-w-[1200px]">
      {!canPay && (
        <p className="-mt-2 m-0 text-sm text-muted">Only a Super Admin can mark payouts as paid.</p>
      )}
      <QueryView query={query} label="payouts">
        {(rows) =>
          rows.length === 0 ? (
            <p className="m-0 text-muted">No payouts yet.</p>
          ) : (
            <>
              <table className="hidden w-full border-collapse text-sm md:table">
                <thead>
                  <tr className="border-b-2 border-rule text-left text-xs text-muted">
                    {['Organizer', 'Amount owed', 'Method', 'Status', ''].map((h, i) => (
                      <th key={i} scope="col" className="px-2 py-2.5 font-semibold">
                        {h || <span className="sr-only">Action</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id} className="border-b border-hair">
                      <td className="px-2 py-3 font-semibold">
                        <Link
                          to={`/admin/organizers/${p.handle}`}
                          className="text-fg no-underline hover:text-accent-text"
                        >
                          {p.organizerName}
                        </Link>
                      </td>
                      <td className="px-2 py-3 whitespace-nowrap">
                        {formatMoney(p.currency, p.amountMinor)}
                      </td>
                      <td className="px-2 py-3">{PAYOUT_METHOD[p.method]}</td>
                      <td className="px-2 py-3">
                        <Tag tone={PAYOUT_STATUS[p.status].tone}>
                          {PAYOUT_STATUS[p.status].label}
                        </Tag>
                      </td>
                      <td className="px-2 py-3 text-right">{action(p)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0 md:hidden">
                {rows.map((p) => (
                  <li key={p.id}>
                    <Card className="flex flex-col gap-1 p-4">
                      <span className="font-extrabold">{p.organizerName}</span>
                      <span className="text-xs text-muted">{PAYOUT_METHOD[p.method]}</span>
                      <div className="mt-1.5 flex items-center justify-between">
                        <span className="text-lg font-extrabold">
                          {formatMoney(p.currency, p.amountMinor)}
                        </span>
                        <Tag tone={PAYOUT_STATUS[p.status].tone}>
                          {PAYOUT_STATUS[p.status].label}
                        </Tag>
                      </div>
                      <div className="mt-2">{action(p, true)}</div>
                    </Card>
                  </li>
                ))}
              </ul>
            </>
          )
        }
      </QueryView>
      {paying && <MarkPaidDialog payout={paying} onClose={() => setPaying(null)} />}
    </AdminPage>
  );
}

function MarkPaidDialog({ payout, onClose }: { payout: AdminPayoutRow; onClose: () => void }) {
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const markPaid = useMarkPaid();

  const submit = (ev?: FormEvent) => {
    ev?.preventDefault();
    const parsed = markPaidRequestSchema.safeParse({ reference });
    if (!parsed.success) return setError(parsed.error.issues[0]!.message);
    markPaid.mutate({ id: payout.id, reference: parsed.data.reference }, { onSuccess: onClose });
  };

  const serverError =
    markPaid.error instanceof ApiError
      ? markPaid.error.message
      : markPaid.error
        ? "Couldn't save. Try again."
        : null;

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Mark ${payout.organizerName} as paid`}
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => submit()} disabled={markPaid.isPending}>
            {markPaid.isPending ? 'Saving…' : 'Mark as paid'}
          </Button>
        </>
      }
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-3">
        <p className="m-0">
          Record the {PAYOUT_METHOD[payout.method]} transfer of{' '}
          <strong>{formatMoney(payout.currency, payout.amountMinor)}</strong>. This can't be undone.
        </p>
        <TextField
          label={payout.method === 'mpesa' ? 'M-Pesa transaction code' : 'Bank reference'}
          placeholder={payout.method === 'mpesa' ? 'e.g. SJ48KQ2P7T' : 'e.g. FT26270XK91'}
          autoComplete="off"
          value={reference}
          onChange={(e) => {
            setReference(e.target.value);
            setError(null);
          }}
          error={error ?? serverError ?? undefined}
        />
      </form>
    </Dialog>
  );
}
