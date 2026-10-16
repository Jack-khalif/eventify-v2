import type { Currency, PaymentFailure } from '@eventify/shared';

/** One payment prompt: an M-Pesa STK push or a Paystack card page. */
export type PaymentRequest = {
  /** Unique per prompt, never reused: Paystack refuses a reference it has seen before. */
  reference: string;
  method: 'mpesa' | 'card';
  amountMinor: number;
  currency: Currency;
  email: string;
  phone: string;
  orderId: string;
  /** Card payments: where Paystack sends the buyer back to once they're done. */
  returnUrl: string;
};

export type RequestResult =
  | {
      ok: true;
      /** Card: the page to send the buyer to. M-Pesa: null, the prompt is on their phone. */ paymentUrl:
        string | null;
    }
  | { ok: false; failure: PaymentFailure; detail: string };

/** Where a prompt stands according to the provider. */
export type PaymentCheck =
  | { state: 'pending' }
  | { state: 'paid'; amountMinor: number; currency: string }
  | { state: 'failed'; failure: PaymentFailure; detail: string };

/** What the provider needs to look a prompt up; the simulated one decides from these alone. */
export type AttemptInfo = {
  reference: string;
  buyerPhone: string;
  requestedAt: Date;
  amountMinor: number;
  currency: Currency;
};

export type PaymentProvider = {
  request: (req: PaymentRequest) => Promise<RequestResult>;
  check: (attempt: AttemptInfo, now: number) => Promise<PaymentCheck>;
  /** Send a successful payment back in full. Resolves false if the provider wouldn't take it. */
  refund: (reference: string) => Promise<boolean>;
  /**
   * The reference a webhook is about, or null if it isn't genuine (or isn't about a charge).
   * Left out by providers without webhooks.
   */
  webhookReference?: (
    rawBody: string,
    headers: (name: string) => string | undefined,
  ) => string | null;
  /** How long after a prompt to start asking the provider about it, and how often after that. */
  checkAfterMs: number;
  checkEveryMs: number;
  /** An M-Pesa prompt nobody has answered by now counts as timed out. null = the provider says. */
  promptTimeoutMs: number | null;
};

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

/** Pretend payments: nobody is charged and everybody "pays", except the test numbers above. */
export const simulatedPayments: PaymentProvider = {
  request: async () => ({ ok: true, paymentUrl: null }),
  check: async ({ buyerPhone, requestedAt, amountMinor, currency }, now) => {
    const elapsed = now - requestedAt.getTime();
    const outcome = TEST_PHONE_OUTCOMES[buyerPhone.slice(-4)];
    const failed = (failure: PaymentFailure): PaymentCheck => ({
      state: 'failed',
      failure,
      detail: 'Simulated',
    });
    if (outcome === 'timeout') {
      return elapsed >= PROMPT_TIMES_OUT_AFTER_MS ? failed('timeout') : { state: 'pending' };
    }
    if (elapsed < PROMPT_ANSWERED_AFTER_MS) return { state: 'pending' };
    return outcome ? failed(outcome) : { state: 'paid', amountMinor, currency };
  },
  refund: async () => true,
  checkAfterMs: 0,
  checkEveryMs: 0,
  promptTimeoutMs: null,
};
