import {
  isCheckoutError,
  ORDER_HOLD_MINUTES,
  validateCheckout,
  type CheckoutRequest,
  type OrderView,
  type PublicEvent,
} from '@eventify/shared';
import { TEST_PHONE_OUTCOMES } from './testPhones';

/**
 * In-browser stand-in for the order + M-Pesa flow until Phase C. Outcomes are chosen by the
 * last four digits of the buyer's phone, like test card numbers.
 */
/** Matches the design's demo: the "customer" approves after about 4.5 seconds. */
export const PROMPT_ANSWERED_AFTER_MS = 4_500;
export const PROMPT_TIMES_OUT_AFTER_MS = 12_000;

const orders = new Map<string, OrderView>();
let sequence = 0;

export function resetOrders() {
  orders.clear();
  sequence = 0;
}

const iso = (ms: number) => new Date(ms).toISOString();

function issueTickets(order: OrderView, event: PublicEvent) {
  const key = event.id.replace(/^evt_/, '').toUpperCase();
  order.tickets = Array.from({ length: order.quantity }, () => {
    sequence += 1;
    return {
      id: `tkt_${order.id}_${sequence}`,
      code: `EVT-${key}-${String(4820 + sequence).padStart(4, '0')}`,
      holderName: order.buyer.name,
    };
  });
}

/** Advance an order the way the payment provider and hold timer would have by now. */
function settle(order: OrderView, events: PublicEvent[], now: number) {
  const open = order.status === 'awaiting_payment' || order.status === 'failed';
  if (open && now >= Date.parse(order.holdExpiresAt)) {
    order.status = 'expired';
    return;
  }
  if (order.status !== 'awaiting_payment' || !order.paymentRequestedAt) return;

  const elapsed = now - Date.parse(order.paymentRequestedAt);
  const outcome = TEST_PHONE_OUTCOMES[order.buyer.phone.slice(-4)];
  if (outcome === 'timeout') {
    if (elapsed >= PROMPT_TIMES_OUT_AFTER_MS) {
      order.status = 'failed';
      order.failureReason = 'timeout';
    }
    return;
  }
  if (elapsed < PROMPT_ANSWERED_AFTER_MS) return;
  if (outcome) {
    order.status = 'failed';
    order.failureReason = outcome;
  } else {
    order.status = 'paid';
    issueTickets(
      order,
      events.find((e) => e.id === order.eventId)!,
    );
  }
}

export function createOrder(event: PublicEvent, req: CheckoutRequest, now = Date.now()) {
  const check = validateCheckout(event, req, new Date(now));
  if (isCheckoutError(check)) return check;

  sequence += 1;
  const free = check.totalMinor === 0;
  const order: OrderView = {
    id: `ord_${String(sequence).padStart(5, '0')}`,
    eventId: event.id,
    tierId: check.tier.id,
    quantity: req.quantity,
    totalMinor: check.totalMinor,
    currency: event.currency,
    buyer: req.buyer,
    paymentMethod: free ? null : req.paymentMethod,
    status: free ? 'paid' : 'awaiting_payment',
    failureReason: null,
    paymentRequestedAt: free ? null : iso(now),
    holdExpiresAt: iso(now + ORDER_HOLD_MINUTES * 60_000),
    rateBps: 500,
    createdAt: iso(now),
    tickets: [],
  };
  if (free) issueTickets(order, event);
  orders.set(order.id, order);
  return order;
}

export function getOrder(id: string, events: PublicEvent[], now = Date.now()) {
  const order = orders.get(id);
  if (order) settle(order, events, now);
  return order;
}

/** "Resend prompt" / "Try again": a fresh STK push for the same order while the hold lasts. */
export function retryPayment(id: string, events: PublicEvent[], now = Date.now()) {
  const order = getOrder(id, events, now);
  if (!order) return undefined;
  if (order.status !== 'awaiting_payment' && order.status !== 'failed') return order;
  order.status = 'awaiting_payment';
  order.failureReason = null;
  order.paymentRequestedAt = iso(now);
  return order;
}

export function cancelOrder(id: string, events: PublicEvent[], now = Date.now()) {
  const order = getOrder(id, events, now);
  if (order && (order.status === 'awaiting_payment' || order.status === 'failed')) {
    order.status = 'cancelled';
  }
  return order;
}
