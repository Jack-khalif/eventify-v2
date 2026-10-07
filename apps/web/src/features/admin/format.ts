import {
  formatMoney,
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

export const PAYOUT_METHOD = { mpesa: 'M-Pesa', bank: 'Bank' } as const;

export const FAILURE_LABEL: Record<PaymentFailure, string> = {
  insufficient_funds: 'Not enough funds',
  cancelled_by_user: 'Cancelled on phone',
  wrong_pin: 'Wrong PIN',
  timeout: 'No response',
  unknown: 'Other',
};

export const count = (n: number) => n.toLocaleString('en-US');
