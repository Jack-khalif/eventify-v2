import {
  formatMoney,
  MERCH_ITEM_LABEL,
  MERCH_STATUS_LABEL,
  type MerchLine,
  type MerchStatus,
  type MoneyByCurrency,
  type OrganizerStatus,
  type PaymentFailure,
  type PayoutStatus,
} from '@eventify/shared';
import type { TagTone } from '../../components/ui/Tag';

/** "KSh 1,079,330 · SSP 180,000", or "—" when there is nothing. */
export const formatMoneyList = (list: MoneyByCurrency) =>
  list.length ? list.map((m) => formatMoney(m.currency, m.amountMinor)).join(' · ') : '—';

export const ORGANIZER_STATUS: Record<OrganizerStatus, { label: string; tone: TagTone }> = {
  active: { label: 'Active', tone: 'accent' },
  pending: { label: 'Pending', tone: 'outline' },
  suspended: { label: 'Suspended', tone: 'danger' },
  rejected: { label: 'Declined', tone: 'neutral' },
};

export const PAYOUT_STATUS: Record<PayoutStatus, { label: string; tone: TagTone }> = {
  pending: { label: 'Pending', tone: 'accent' },
  processing: { label: 'Processing', tone: 'outline' },
  paid: { label: 'Paid', tone: 'neutral' },
};

export const MERCH_STATUS: Record<MerchStatus, { label: string; tone: TagTone }> = {
  received: { label: MERCH_STATUS_LABEL.received, tone: 'accent' },
  in_production: { label: MERCH_STATUS_LABEL.in_production, tone: 'outline' },
  ready: { label: MERCH_STATUS_LABEL.ready, tone: 'good' },
  delivered: { label: MERCH_STATUS_LABEL.delivered, tone: 'neutral' },
  cancelled: { label: MERCH_STATUS_LABEL.cancelled, tone: 'danger' },
};

/** "500 Wristbands · 2 Banners" */
export const merchSummary = (items: MerchLine[]) =>
  items.map((l) => `${count(l.quantity)} ${MERCH_ITEM_LABEL[l.item]}`).join(' · ');

export const PAYOUT_METHOD = { mpesa: 'M-Pesa', bank: 'Bank' } as const;

export const FAILURE_LABEL: Record<PaymentFailure, string> = {
  insufficient_funds: 'Not enough funds',
  cancelled_by_user: 'Cancelled on phone',
  wrong_pin: 'Wrong PIN',
  timeout: 'No response',
  declined: 'Card declined',
  unknown: 'Other',
};

export const count = (n: number) => n.toLocaleString('en-US');
