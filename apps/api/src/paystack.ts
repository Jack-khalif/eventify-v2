import type { PaymentFailure } from '@eventify/shared';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PaymentCheck, PaymentProvider, RequestResult } from './payments';

/**
 * Payments through Paystack (https://paystack.com/docs/api): M-Pesa by STK push through the Charge
 * API, cards on Paystack's own checkout page. Paystack tells us the outcome by webhook; we always
 * confirm it with Verify Transaction before trusting it, and ask Verify ourselves if a webhook is
 * slow (see settle in orders.ts).
 */

const API = 'https://api.paystack.co';

type Answer = { status?: boolean; message?: string; data?: Record<string, unknown> };

/**
 * Read Paystack's free-text reason onto the buyer-facing failures. Paystack has no stable codes for
 * these, so this matches on words; anything unrecognised is `unknown`, which tells the buyer to get
 * in touch if money left their account.
 */
export function failureFrom(gatewayResponse: string, method: 'mpesa' | 'card'): PaymentFailure {
  const text = gatewayResponse.toLowerCase();
  if (/insufficient|not enough|low balance/.test(text)) return 'insufficient_funds';
  if (method === 'card') {
    return /declin|do not honou?r|not permitted|restricted|lost|stolen|invalid card|expired card|blocked/.test(
      text,
    )
      ? 'declined'
      : 'unknown';
  }
  if (/cancel|declined by (the )?user|rejected by (the )?user/.test(text))
    return 'cancelled_by_user';
  if (/\bpin\b/.test(text)) return 'wrong_pin';
  if (
    /time ?out|timed out|expired|no response|not respond|unreachable|did not complete/.test(text)
  ) {
    return 'timeout';
  }
  return 'unknown';
}

export function paystackPayments(secretKey: string): PaymentProvider {
  async function call(
    path: string,
    body?: object,
  ): Promise<{ httpStatus: number; answer: Answer }> {
    const res = await fetch(`${API}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const answer = (await res.json().catch(() => ({}))) as Answer;
    return { httpStatus: res.status, answer };
  }

  const text = (v: unknown) => (typeof v === 'string' ? v : '');
  /** Prompts we sent carry the order's method in their metadata; older ones are M-Pesa. */
  const methodOf = (data: Record<string, unknown>): 'mpesa' | 'card' =>
    text((data.metadata as Record<string, unknown> | null)?.method) === 'card' ||
    text(data.channel) === 'card'
      ? 'card'
      : 'mpesa';

  return {
    async request(req): Promise<RequestResult> {
      const metadata = { order_id: req.orderId, method: req.method };
      try {
        if (req.method === 'card') {
          const { answer } = await call('/transaction/initialize', {
            email: req.email,
            amount: req.amountMinor,
            currency: req.currency,
            reference: req.reference,
            channels: ['card'],
            callback_url: req.returnUrl,
            metadata,
          });
          const url = text(answer.data?.authorization_url);
          if (answer.status && url) return { ok: true, paymentUrl: url };
          return { ok: false, failure: 'unknown', detail: answer.message ?? 'No checkout page' };
        }

        const { answer } = await call('/charge', {
          email: req.email,
          amount: req.amountMinor,
          currency: req.currency,
          reference: req.reference,
          mobile_money: { phone: req.phone, provider: 'mpesa' },
          metadata,
        });
        const data = answer.data ?? {};
        if (!answer.status || data.status === 'failed') {
          const detail = text(data.gateway_response) || answer.message || 'Charge refused';
          return { ok: false, failure: failureFrom(detail, 'mpesa'), detail };
        }
        return { ok: true, paymentUrl: null };
      } catch (error) {
        return {
          ok: false,
          failure: 'unknown',
          detail: `Couldn't reach Paystack: ${String(error)}`,
        };
      }
    },

    async check({ reference }): Promise<PaymentCheck> {
      try {
        const { httpStatus, answer } = await call(
          `/transaction/verify/${encodeURIComponent(reference)}`,
        );
        // Not found yet: a card buyer who hasn't opened the page, or a charge still being set up.
        if (httpStatus === 404 || !answer.status || !answer.data) return { state: 'pending' };
        const data = answer.data;
        const detail = text(data.gateway_response);
        switch (data.status) {
          case 'success':
            return {
              state: 'paid',
              amountMinor: Number(data.amount),
              currency: text(data.currency),
            };
          case 'failed':
            return { state: 'failed', failure: failureFrom(detail, methodOf(data)), detail };
          case 'reversed':
            return { state: 'failed', failure: 'unknown', detail: detail || 'Reversed' };
          default:
            // ongoing, pending, processing, queued, abandoned (a card page left open): not over yet.
            return { state: 'pending' };
        }
      } catch {
        return { state: 'pending' };
      }
    },

    async refund(reference) {
      try {
        const { answer } = await call('/refund', { transaction: reference });
        if (!answer.status) console.error(`Paystack refused the refund of ${reference}`, answer);
        return Boolean(answer.status);
      } catch (error) {
        console.error(`Couldn't reach Paystack to refund ${reference}`, error);
        return false;
      }
    },

    webhookReference(rawBody, header) {
      // Paystack signs the exact bytes it sent with HMAC-SHA512 of our secret key.
      const signature = header('x-paystack-signature') ?? '';
      const expected = createHmac('sha512', secretKey).update(rawBody).digest('hex');
      if (
        signature.length !== expected.length ||
        !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
      ) {
        return null;
      }
      try {
        const body = JSON.parse(rawBody) as { event?: string; data?: { reference?: unknown } };
        if (!body.event?.startsWith('charge.')) return null;
        return text(body.data?.reference) || null;
      } catch {
        return null;
      }
    },

    // M-Pesa prompts usually settle within a minute, and the webhook normally beats us to it.
    checkAfterMs: 20_000,
    checkEveryMs: 10_000,
    promptTimeoutMs: 3 * 60_000,
  };
}
