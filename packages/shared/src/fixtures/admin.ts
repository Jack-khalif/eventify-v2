import { toMinor } from '../money';
import type { Agent, Payout, RateApproval, RateChange } from '../schemas';

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
