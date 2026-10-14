import {
  formatDate,
  MAX_MERCH_QUANTITY,
  MERCH_ITEM_LABEL,
  MERCH_ITEMS,
  merchRequestSchema,
  type MerchItem,
} from '@eventify/shared';
import { Shirt } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ErrorState } from '../../components/PageStates';
import { isNotFound } from '../../lib/api';
import { Button, Card, Dialog, Tag, TextAreaField, TextField } from '../../components/ui';
import { MERCH_STATUS, merchSummary } from '../admin/format';
import { useMerch, useRequestMerch } from './useDashboard';

/**
 * Branded print for an event. Requests go to Eventify's print queue; the organizer follows each
 * one here as the team moves it along.
 */
export function MerchRequests({ eventId, canRequest }: { eventId: string; canRequest: boolean }) {
  const merch = useMerch(eventId);
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);

  // Not on the server yet (see newerEndpoint): show nothing rather than an error.
  if (isNotFound(merch.error)) return null;

  return (
    <Card className="flex min-w-0 flex-[1_1_320px] flex-col gap-3 p-5">
      <h3 className="m-0 text-base">Branded merch</h3>
      <p className="m-0 text-sm text-muted">
        Banners, wristbands, lanyards, posters and table buntings with your branding, printed by our
        partners. We'll confirm the price with you before anything is printed.
      </p>
      {sent && (
        <p role="status" className="m-0 rounded-lg bg-good-soft px-3 py-2 text-sm text-good">
          Request sent. We'll be in touch about artwork and a quote.
        </p>
      )}
      {merch.isError ? (
        <ErrorState onRetry={merch.refetch}>Couldn't load merch requests.</ErrorState>
      ) : merch.data && merch.data.requests.length > 0 ? (
        <ul aria-label="Merch requests" className="m-0 list-none p-0">
          {merch.data.requests.map((r) => (
            <li key={r.id} className="flex flex-col gap-1.5 border-b border-hair py-2.5 text-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="font-semibold">{merchSummary(r.items)}</span>
                <Tag tone={MERCH_STATUS[r.status].tone} className="flex-none">
                  {MERCH_STATUS[r.status].label}
                </Tag>
              </div>
              <span className="text-xs text-muted">
                Requested {formatDate(r.createdAt)}
                {r.updatedAt !== r.createdAt && ` · updated ${formatDate(r.updatedAt)}`}
              </span>
              {r.opsNote && (
                <p className="m-0 rounded-lg bg-surface px-3 py-2 text-[13px]">
                  <span className="font-bold">From Eventify:</span> {r.opsNote}
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {canRequest && merch.data && (
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSent(false);
              setOpen(true);
            }}
          >
            <Shirt size={15} aria-hidden /> Request merch
          </Button>
        </div>
      )}
      {open && (
        <RequestDialog
          eventId={eventId}
          onClose={() => setOpen(false)}
          onSent={() => {
            setOpen(false);
            setSent(true);
          }}
        />
      )}
    </Card>
  );
}

function RequestDialog({
  eventId,
  onClose,
  onSent,
}: {
  eventId: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const request = useRequestMerch(eventId);
  const [quantities, setQuantities] = useState<Partial<Record<MerchItem, string>>>({});
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<{ items?: string; brandingNotes?: string }>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const items = MERCH_ITEMS.flatMap((item) => {
      const quantity = Number(quantities[item] || 0);
      return quantity > 0 ? [{ item, quantity }] : [];
    });
    const parsed = merchRequestSchema.safeParse({ items, brandingNotes: notes });
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] === 'brandingNotes' ? 'brandingNotes' : 'items';
        next[key] ??=
          key === 'items' && issue.path.length > 1
            ? `Enter whole numbers up to ${MAX_MERCH_QUANTITY.toLocaleString('en-US')}.`
            : issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    request.mutate(parsed.data, { onSuccess: onSent });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Request branded merch"
      actions={
        <>
          <Button variant="outline" size="sm" onClick={onClose} disabled={request.isPending}>
            Cancel
          </Button>
          <Button size="sm" type="submit" form="request-merch" disabled={request.isPending}>
            {request.isPending ? 'Sending…' : 'Send request'}
          </Button>
        </>
      }
    >
      <form id="request-merch" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 p-0 text-[13px] font-semibold text-muted">
            How many of each? Leave blank what you don't need.
          </legend>
          <div className="grid grid-cols-2 gap-3">
            {MERCH_ITEMS.map((item) => (
              <TextField
                key={item}
                label={MERCH_ITEM_LABEL[item]}
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_MERCH_QUANTITY}
                placeholder="0"
                value={quantities[item] ?? ''}
                onChange={(e) => setQuantities((q) => ({ ...q, [item]: e.target.value }))}
              />
            ))}
          </div>
          {errors.items && (
            <span role="alert" className="text-xs font-semibold text-danger">
              {errors.items}
            </span>
          )}
        </fieldset>
        <TextAreaField
          label="Branding notes"
          placeholder="Logo and colours to use, wording, sizes, where the banners go…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          error={errors.brandingNotes}
          hint="We'll reply by email for your logo files."
        />
        {request.error && (
          <p role="alert" className="m-0 font-semibold text-danger">
            {request.error.message}
          </p>
        )}
      </form>
    </Dialog>
  );
}
