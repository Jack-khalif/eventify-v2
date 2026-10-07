import type { PaymentFailure } from '@eventify/shared';

/** Mock API only: the last four digits of the buyer's phone pick the simulated M-Pesa outcome. */
export const TEST_PHONE_OUTCOMES: Record<string, PaymentFailure> = {
  '0000': 'insufficient_funds',
  '1111': 'cancelled_by_user',
  '2222': 'wrong_pin',
  '3333': 'timeout',
};

/** Mock API only: the one-time code sign-in and "Find my tickets" accept. */
export const TEST_LOOKUP_CODE = '123456';

/** Mock API only: a phone that already has a ticket, so "Find my tickets" works before buying. */
export const DEMO_TICKET_PHONE = '+254712345678';

/** Mock API only: the sample accounts in the shared fixtures, one per kind of user. */
export const TEST_SIGN_INS = [
  { label: 'Organizer (approved)', phone: '+254700000001' },
  { label: 'Organizer (waiting for approval)', phone: '+254700000002' },
  { label: 'Organizer (suspended)', phone: '+254700000003' },
  { label: 'Agent', phone: '+254700000010' },
  { label: 'Super Admin', phone: '+254700000020' },
] as const;
