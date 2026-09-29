import { toMinor } from '../money';
import type { Agent, PaymentFailure, Payout, RateApproval, RateChange } from '../schemas';

export const agents: Agent[] = [
  { id: 'agent_grace', name: 'Grace Achieng' },
  { id: 'agent_peter', name: 'Peter Lado' },
];

/** Lifetime gross sales per organizer, as shown in the admin portal. */
export const organizerSalesMinor: Record<string, number> = {
  org_amani: toMinor(452_600),
  org_ieee: toMinor(12_000),
  org_deng: toMinor(180_000),
  org_paylink: toMinor(612_000),
  org_mizizi: 0,
  org_lens: toMinor(64_000),
};

export const rateChanges: RateChange[] = [
  {
    id: 'rc_1',
    organizerId: 'org_amani',
    oldBps: 500,
    newBps: 450,
    reason: 'Repeat host, high volume — volume discount',
    changedBy: 'Grace Achieng',
    at: '2026-08-14T10:00:00+03:00',
    eventId: null,
  },
  {
    id: 'rc_2',
    organizerId: 'org_paylink',
    oldBps: 500,
    newBps: 420,
    reason: 'Corporate multi-event contract',
    changedBy: 'Peter Lado',
    at: '2026-09-02T10:00:00+03:00',
    eventId: null,
  },
];

export const rateApprovals: RateApproval[] = [
  {
    id: 'ap_0',
    organizerId: 'org_lens',
    agentId: 'agent_peter',
    requestedBps: 240,
    eventId: null,
    reason: 'Long-term partner, first year retention deal',
    requestedAt: '2026-09-26T10:00:00+03:00',
    status: 'pending',
  },
];

export const payouts: Payout[] = [
  {
    id: 'po_1',
    organizerId: 'org_amani',
    amountMinor: toMinor(432_234),
    method: 'mpesa',
    status: 'pending',
  },
  {
    id: 'po_2',
    organizerId: 'org_paylink',
    amountMinor: toMinor(586_296),
    method: 'bank',
    status: 'processing',
  },
  {
    id: 'po_3',
    organizerId: 'org_deng',
    amountMinor: toMinor(171_000),
    method: 'bank',
    status: 'paid',
  },
  {
    id: 'po_4',
    organizerId: 'org_lens',
    amountMinor: toMinor(60_800),
    method: 'mpesa',
    status: 'pending',
  },
];

/** Days of history behind the admin overview's charts and totals. */
export const HISTORY_DAYS = 90;

/** Deterministic noise, so the sample charts look the same on every load and in tests. */
function wave(seed: number, i: number) {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43_758.5453;
  return x - Math.floor(x);
}

/**
 * Daily gross for the last 90 days, oldest first, for the admin overview. Sales grow toward the
 * present and add up to 60% of the organizer's lifetime sales (the rest is older).
 */
export function organizerDailySalesMinor(organizerId: string): number[] {
  const total = Math.round((organizerSalesMinor[organizerId] ?? 0) * 0.6);
  const seed = [...organizerId].reduce((a, c) => a + c.charCodeAt(0), 0);
  const weights = Array.from(
    { length: HISTORY_DAYS },
    (_, i) => (0.4 + i / HISTORY_DAYS) * (0.5 + wave(seed, i)),
  );
  const sum = weights.reduce((a, w) => a + w, 0);
  const days = weights.map((w) => Math.floor((total * w) / sum / 100) * 100);
  days[HISTORY_DAYS - 1]! += total - days.reduce((a, d) => a + d, 0);
  return days;
}

/** M-Pesa STK pushes per day across all markets, and why the failed ones failed. */
export const mpesaDaily = {
  attempts: Array.from(
    { length: HISTORY_DAYS },
    (_, i) => 30 + Math.round(40 * (i / HISTORY_DAYS) + 20 * wave(7, i)),
  ),
  failures: {
    insufficient_funds: Array.from({ length: HISTORY_DAYS }, (_, i) =>
      Math.round(1.4 * wave(11, i)),
    ),
    cancelled_by_user: Array.from({ length: HISTORY_DAYS }, (_, i) =>
      Math.round(1.1 * wave(13, i)),
    ),
    wrong_pin: Array.from({ length: HISTORY_DAYS }, (_, i) => Math.round(0.7 * wave(17, i))),
    timeout: Array.from({ length: HISTORY_DAYS }, (_, i) => Math.round(0.9 * wave(19, i))),
  } satisfies Record<Exclude<PaymentFailure, 'unknown'>, number[]>,
};
