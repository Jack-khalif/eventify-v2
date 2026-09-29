import { toEatIso, type RateApproval, type RateChange } from '@eventify/shared';
import { organizers, rateApprovals, rateChanges } from '@eventify/shared/fixtures';

/**
 * Organizer fee rates as the admin portal changes them, until the backend exists. Checkout, the
 * organizer dashboard and admin all read rates from here, so a change applies to the next sale.
 */

type Db = { changes: RateChange[]; approvals: RateApproval[] };

const STORAGE_KEY = 'eventify-mock-rates';
let db: Db = load();

function initial(): Db {
  return { changes: [...rateChanges], approvals: [...rateApprovals] };
}

function load(): Db {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Db;
  } catch {
    // Storage blocked or corrupt: start from the samples.
  }
  return initial();
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Not persisted; fine for a mock.
  }
}

export function resetRates() {
  db = initial();
}

const latest = (changes: RateChange[]) =>
  changes.reduce<RateChange | undefined>(
    (a, c) => (!a || Date.parse(c.at) >= Date.parse(a.at) ? c : a),
    undefined,
  );

/** The organizer's current rate for new sales. */
export function organizerRate(organizerId: string): number {
  const change = latest(db.changes.filter((c) => c.organizerId === organizerId && !c.eventId));
  return change?.newBps ?? organizers.find((o) => o.id === organizerId)?.rateBps ?? 500;
}

/** The event's own rate if it has one, else null. */
export function eventOverride(eventId: string): number | null {
  return latest(db.changes.filter((c) => c.eventId === eventId))?.newBps ?? null;
}

/** The rate charged on a sale for this event right now. */
export const eventRate = (organizerId: string, eventId: string) =>
  eventOverride(eventId) ?? organizerRate(organizerId);

/** Newest first. */
export const rateHistory = (organizerId: string) =>
  db.changes
    .filter((c) => c.organizerId === organizerId)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

export function recordRateChange(change: Omit<RateChange, 'id' | 'at'>, now = Date.now()) {
  db.changes.push({ ...change, id: `rc_${crypto.randomUUID().slice(0, 8)}`, at: toEatIso(now) });
  save();
}

export const pendingApprovals = () => db.approvals.filter((a) => a.status === 'pending');

export function requestApproval(
  approval: Omit<RateApproval, 'id' | 'requestedAt' | 'status'>,
  now = Date.now(),
) {
  // A newer request for the same organizer and event replaces the one still waiting.
  db.approvals = db.approvals.filter(
    (a) =>
      !(
        a.status === 'pending' &&
        a.organizerId === approval.organizerId &&
        a.eventId === approval.eventId
      ),
  );
  db.approvals.push({
    ...approval,
    id: `ap_${crypto.randomUUID().slice(0, 8)}`,
    requestedAt: toEatIso(now),
    status: 'pending',
  });
  save();
}

export function resolveApproval(id: string, status: 'approved' | 'rejected') {
  const approval = db.approvals.find((a) => a.id === id && a.status === 'pending');
  if (!approval) return undefined;
  approval.status = status;
  save();
  return approval;
}
