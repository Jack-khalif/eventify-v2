import {
  compRequestSchema,
  formatDate,
  MAX_COMPS_PER_REQUEST,
  normalizePhone,
  type CompList,
  type CompRequest,
} from '@eventify/shared';
import { Gift } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ErrorState } from '../../components/PageStates';
import { isNotFound } from '../../lib/api';
import { Button, Card, Dialog, SelectField, Stepper, Tag, TextField } from '../../components/ui';
import { useComps, useIssueComps } from './useDashboard';

type FieldErrors = Partial<Record<keyof CompRequest, string>>;

/**
 * Complimentary tickets: free tickets for guests, press or sponsors, emailed like a purchase.
 * They fill capacity and get checked in, but stay out of sales and payouts.
 */
export function CompTickets({ eventId, canIssue }: { eventId: string; canIssue: boolean }) {
  const comps = useComps(eventId);
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const issued = comps.data?.comps.reduce((sum, c) => sum + c.quantity, 0) ?? 0;

  // Not on the server yet (see newerEndpoint): show nothing rather than an error.
  if (isNotFound(comps.error)) return null;

  return (
    <Card className="flex min-w-0 flex-[1_1_320px] flex-col gap-3 p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="m-0 text-base">Complimentary tickets</h3>
        {issued > 0 && (
          <span className="text-[13px] font-extrabold text-accent-text">{issued} issued</span>
        )}
      </div>
      <p className="m-0 text-sm text-muted">
        Free tickets for guests, press or sponsors. Each guest gets their ticket by email, the same
        as a buyer. They don't count as sales.
      </p>
      {sent && (
        <p role="status" className="m-0 rounded-lg bg-good-soft px-3 py-2 text-sm text-good">
          {sent}
        </p>
      )}
      {comps.isError ? (
        <ErrorState onRetry={comps.refetch}>Couldn't load complimentary tickets.</ErrorState>
      ) : comps.data && comps.data.comps.length > 0 ? (
        <ul className="m-0 list-none p-0">
          {comps.data.comps.map((c, i) => (
            <li
              key={`${c.issuedAt}-${c.email}-${i}`}
              className="flex items-center justify-between gap-3 border-b border-hair py-2.5 text-sm"
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-semibold">{c.name}</span>
                <span className="truncate text-xs text-muted">{c.email}</span>
              </span>
              <span className="flex flex-none flex-col items-end gap-1">
                <span className="text-xs font-bold">
                  {c.quantity} × {c.tierName}
                </span>
                <span className="text-[11px] text-muted">
                  {formatDate(c.issuedAt)}
                  {!c.emailed && (
                    <>
                      {' · '}
                      <Tag tone="neutral" className="px-1.5 py-0.5 text-[10px]">
                        Email pending
                      </Tag>
                    </>
                  )}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {canIssue && comps.data && (
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSent(null);
              setOpen(true);
            }}
          >
            <Gift size={15} aria-hidden /> Issue tickets
          </Button>
        </div>
      )}
      {open && comps.data && (
        <IssueDialog
          eventId={eventId}
          tiers={comps.data.tiers}
          onClose={() => setOpen(false)}
          onIssued={(req) => {
            setOpen(false);
            setSent(
              `${req.quantity} ${req.quantity === 1 ? 'ticket' : 'tickets'} sent to ${req.email}.`,
            );
          }}
        />
      )}
    </Card>
  );
}

function IssueDialog({
  eventId,
  tiers,
  onClose,
  onIssued,
}: {
  eventId: string;
  tiers: CompList['tiers'];
  onClose: () => void;
  onIssued: (req: CompRequest) => void;
}) {
  const issue = useIssueComps(eventId);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [tierId, setTierId] = useState(
    (tiers.find((t) => t.remaining !== 0) ?? tiers[0])?.id ?? '',
  );
  const [quantity, setQuantity] = useState(1);
  const [errors, setErrors] = useState<FieldErrors>({});
  const remaining = tiers.find((t) => t.id === tierId)?.remaining ?? null;
  const max = Math.max(1, Math.min(MAX_COMPS_PER_REQUEST, remaining ?? MAX_COMPS_PER_REQUEST));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = compRequestSchema.safeParse({
      name,
      email: email.trim(),
      // Blank is fine; something that isn't a number is sent as is so it's flagged.
      phone: phone.trim() ? (normalizePhone(phone) ?? phone) : null,
      tierId,
      quantity,
    });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof CompRequest;
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    issue.mutate(parsed.data, { onSuccess: () => onIssued(parsed.data) });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Issue complimentary tickets"
      actions={
        <>
          <Button variant="outline" size="sm" onClick={onClose} disabled={issue.isPending}>
            Cancel
          </Button>
          <Button size="sm" type="submit" form="issue-comps" disabled={issue.isPending}>
            {issue.isPending ? 'Sending…' : `Send ${quantity === 1 ? 'ticket' : 'tickets'}`}
          </Button>
        </>
      }
    >
      <form id="issue-comps" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TextField
          label="Guest's name"
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
        />
        <TextField
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          hint="Their tickets go here."
        />
        <TextField
          label="Phone (optional)"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder="07XX XXX XXX"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={errors.phone}
          hint="Lets them find the tickets by phone too, and the door search for them by number."
        />
        <SelectField
          label="Tier"
          value={tierId}
          onChange={(e) => {
            setTierId(e.target.value);
            setQuantity(1);
          }}
          error={errors.tierId}
        >
          {tiers.map((t) => (
            <option key={t.id} value={t.id} disabled={t.remaining === 0}>
              {t.name}
              {t.remaining === null
                ? ''
                : t.remaining === 0
                  ? ' (sold out)'
                  : ` (${t.remaining} left)`}
            </option>
          ))}
        </SelectField>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-semibold text-muted">Tickets</span>
          <Stepper value={quantity} onChange={setQuantity} max={max} label="Tickets" />
        </div>
        <p className="m-0 text-xs text-muted">
          Free of charge. They use up places in the tier, like a sale would.
        </p>
        {issue.error && (
          <p role="alert" className="m-0 font-semibold text-danger">
            {issue.error.message}
          </p>
        )}
      </form>
    </Dialog>
  );
}
