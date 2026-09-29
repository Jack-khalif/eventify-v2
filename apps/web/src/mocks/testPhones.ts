import type { PaymentFailure } from '@eventify/shared';

/** Mock API only: the last four digits of the buyer's phone pick the simulated M-Pesa outcome. */
export const TEST_PHONE_OUTCOMES: Record<string, PaymentFailure> = {
  '0000': 'insufficient_funds',
  '1111': 'cancelled_by_user',
  '2222': 'wrong_pin',
  '3333': 'timeout',
};
