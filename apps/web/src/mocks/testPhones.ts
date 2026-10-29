import type { PaymentFailure } from '@eventify/shared';

/** Mock API only: the last four digits of the buyer's phone pick the simulated M-Pesa outcome. */
export const TEST_PHONE_OUTCOMES: Record<string, PaymentFailure> = {
  '0000': 'insufficient_funds',
  '1111': 'cancelled_by_user',
  '2222': 'wrong_pin',
  '3333': 'timeout',
};

/** Mock API only: the one-time email sign-in code. */
export const TEST_EMAIL_CODE = '123456';

/** Mock API only: a phone used to seed a demo ticket for door-scanner tests. */
export const DEMO_TICKET_PHONE = '+254712345678';

/** Mock API only: the password every sample organizer signs in with. */
export const TEST_PASSWORD = 'eventify-demo';
