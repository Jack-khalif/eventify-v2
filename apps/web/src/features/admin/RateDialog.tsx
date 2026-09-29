import {
  APPROVAL_FLOOR_BPS,
  decideRateChange,
  formatDate,
  formatRate,
  isRateError,
  MAX_RATE_BPS,
  MIN_RATE_BPS,
  rateNeedsApproval,
  type AdminOrganizerDetail,
  type AdminRole,
} from '@eventify/shared';
import { useState } from 'react';
import { Button, Dialog, SelectField, TextAreaField } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { useChangeRate } from './useAdmin';

type RateDialogProps = {
  org: AdminOrganizerDetail;
  role: AdminRole;
  onClose: () => void;
  onDone: (message: string) => void;
};

/** Change an organizer's fee rate, for all future sales or one upcoming event. */
export function RateDialog({ org, role, onClose, onDone }: RateDialogProps) {
  const upcoming = org.events.filter((e) => e.status === 'live');
  const [rateBps, setRateBps] = useState(org.rateBps);
  const [reason, setReason] = useState('');
  const [perEvent, setPerEvent] = useState(false);
  const [eventId, setEventId] = useState(upcoming[0]?.id ?? '');
  const [attempted, setAttempted] = useState(false);
  const change = useChangeRate(org.handle);

  const target = perEvent ? upcoming.find((e) => e.id === eventId) : undefined;
  const current = target ? (target.rateBps ?? org.rateBps) : org.rateBps;
  const req = { rateBps, reason, eventId: target?.id ?? null };
  const decision = decideRateChange(role, req, current);
  const error = isRateError(decision) ? decision.message : null;
  const needsApproval = !isRateError(decision) && decision.outcome === 'sent_for_approval';

  const submit = () => {
    setAttempted(true);
    if (error) return;
    change.mutate(req, {
      onSuccess: ({ outcome }) =>
        onDone(
          outcome === 'applied'
            ? `Rate for ${target ? target.title : org.name} is now ${formatRate(rateBps)}.`
            : `${formatRate(rateBps)} for ${org.name} was sent to a Super Admin for approval.`,
        ),
    });
  };

  const serverError =
    change.error instanceof ApiError
      ? change.error.message
      : change.error
        ? "Couldn't save the rate. Try again."
        : null;

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Change rate — ${org.name}`}
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={change.isPending}>
            {change.isPending ? 'Saving…' : needsApproval ? 'Send for approval' : 'Apply rate'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-[13px]">
            <label htmlFor="rate-slider">New rate</label>
            <span className="font-extrabold">{formatRate(rateBps)}</span>
          </div>
          <input
            id="rate-slider"
            type="range"
            min={MIN_RATE_BPS}
            max={MAX_RATE_BPS}
            step={10}
            value={rateBps}
            onChange={(e) => setRateBps(Number(e.target.value))}
            aria-valuetext={formatRate(rateBps)}
            className="w-full accent-[var(--ev-accent-text)]"
          />
          <div className="flex justify-between text-[11px] text-muted">
            <span>{formatRate(MIN_RATE_BPS)}</span>
            <span>Currently {formatRate(current)}</span>
            <span>{formatRate(MAX_RATE_BPS)}</span>
          </div>
        </div>

        {rateNeedsApproval(rateBps) && (
          <p className="m-0 rounded-lg bg-accent-soft px-3 py-2 text-[13px] font-bold text-accent-text">
            Below {formatRate(APPROVAL_FLOOR_BPS)}
            {role === 'agent'
              ? ': a Super Admin has to approve this before it applies.'
              : ': you are approving this as Super Admin.'}
          </p>
        )}

        <TextAreaField
          label="Reason for change"
          placeholder="e.g. Volume discount for repeat corporate events"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="[&_textarea]:min-h-20"
        />

        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={perEvent}
            disabled={upcoming.length === 0}
            onChange={(e) => setPerEvent(e.target.checked)}
          />
          Apply to a single upcoming event only
          {upcoming.length === 0 && <span className="text-muted">(no upcoming events)</span>}
        </label>
        {perEvent && (
          <SelectField label="Event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            {upcoming.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title} · {formatDate(e.startsAt)}
              </option>
            ))}
          </SelectField>
        )}

        <span className="text-xs text-muted">
          Applies to ticket sales from now on. Tickets already sold keep their rate.
        </span>

        {((attempted && error) || serverError) && (
          <p role="alert" className="m-0 text-[13px] font-semibold text-danger">
            {serverError ?? error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
