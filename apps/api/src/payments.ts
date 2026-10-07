import type { PaymentFailure } from '@eventify/shared';

/** Where a requested payment stands: paid, failed for a reason, or null while the buyer hasn't answered. */
export type PaymentState = 'paid' | PaymentFailure | null;

/**
 * Asked each time an unpaid order is read. The real M-Pesa integration will answer from Daraja's
 * callback (or its STK query); until then only the simulated one exists.
 */
export type PaymentProvider = (
  order: { buyerPhone: string; paymentRequestedAt: Date },
  now: number,
) => PaymentState;

/** The "customer" answers the prompt after about 4.5 seconds, as in the design's demo. */
export const PROMPT_ANSWERED_AFTER_MS = 4_500;
export const PROMPT_TIMES_OUT_AFTER_MS = 12_000;

/** Same test numbers as the web app's mock API: the phone's last four digits pick the outcome. */
const TEST_PHONE_OUTCOMES: Record<string, PaymentFailure> = {
  '0000': 'insufficient_funds',
  '1111': 'cancelled_by_user',
  '2222': 'wrong_pin',
  '3333': 'timeout',
};

/** Pretend M-Pesa: nobody is charged and everybody "pays", except the test numbers above. */
export const simulatedPayments: PaymentProvider = (order, now) => {
  const elapsed = now - order.paymentRequestedAt.getTime();
  const outcome = TEST_PHONE_OUTCOMES[order.buyerPhone.slice(-4)];
  if (outcome === 'timeout') return elapsed >= PROMPT_TIMES_OUT_AFTER_MS ? 'timeout' : null;
  if (elapsed < PROMPT_ANSWERED_AFTER_MS) return null;
  return outcome ?? 'paid';
};
