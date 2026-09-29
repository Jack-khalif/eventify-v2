import {
  generatePassSecret,
  importSigningKey,
  isCheckoutError,
  ORDER_HOLD_MINUTES,
  randomToken,
  signTicketQr,
  validateCheckout,
  type CheckoutRequest,
  type OrderView,
  type PublicEvent,
  type TicketView,
} from '@eventify/shared';
import { DEV_QR_PRIVATE_KEY } from './devKeys';
import { DEMO_TICKET_PHONE, TEST_PHONE_OUTCOMES } from './testPhones';

/**
 * In-browser stand-in for orders, M-Pesa and tickets until the backend exists. Outcomes are chosen
 * by the last four digits of the buyer's phone, like test card numbers. Data is kept in
 * localStorage so a page refresh behaves as it will with the real backend.
 */

/** Matches the design's demo: the "customer" approves after about 4.5 seconds. */
export const PROMPT_ANSWERED_AFTER_MS = 4_500;
export const PROMPT_TIMES_OUT_AFTER_MS = 12_000;

type StoredTicket = {
  id: string;
  code: string;
  orderId: string;
  index: number;
  holderName: string;
  secret: string;
  checkedInAt: string | null;
  checkedInDoor?: string | null;
};
type Db = {
  orders: Record<string, OrderView>;
  tickets: Record<string, StoredTicket>;
  sequence: number;
};

const STORAGE_KEY = 'eventify-mock-db';
let db: Db = load();

function empty(): Db {
  return { orders: {}, tickets: {}, sequence: 0 };
}

function load(): Db {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Db;
  } catch {
    // Storage blocked or corrupt: start fresh for this visit.
  }
  return empty();
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Not persisted; fine for a mock.
  }
}

export function resetOrders() {
  db = empty();
}

const iso = (ms: number) => new Date(ms).toISOString();

function issueTickets(order: OrderView, event: PublicEvent) {
  const key = event.id.replace(/^evt_/, '').toUpperCase();
  order.tickets = Array.from({ length: order.quantity }, (_, i) => {
    db.sequence += 1;
    const ticket: StoredTicket = {
      id: randomToken(),
      code: `EVT-${key}-${String(4820 + db.sequence).padStart(4, '0')}`,
      orderId: order.id,
      index: i + 1,
      holderName: order.buyer.name,
      secret: generatePassSecret(),
      checkedInAt: null,
    };
    db.tickets[ticket.id] = ticket;
    return { id: ticket.id, code: ticket.code, holderName: ticket.holderName };
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

  db.sequence += 1;
  const free = check.totalMinor === 0;
  const order: OrderView = {
    id: `ord_${String(db.sequence).padStart(5, '0')}`,
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
  db.orders[order.id] = order;
  save();
  return order;
}

export function getOrder(id: string, events: PublicEvent[], now = Date.now()) {
  const order = db.orders[id];
  if (order) {
    settle(order, events, now);
    save();
  }
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
  save();
  return order;
}

export function cancelOrder(id: string, events: PublicEvent[], now = Date.now()) {
  const order = getOrder(id, events, now);
  if (order && (order.status === 'awaiting_payment' || order.status === 'failed')) {
    order.status = 'cancelled';
    save();
  }
  return order;
}

let signingKey: Promise<CryptoKey> | null = null;

async function toTicketView(
  t: StoredTicket,
  events: PublicEvent[],
): Promise<TicketView | undefined> {
  const order = db.orders[t.orderId];
  const event = order && events.find((e) => e.id === order.eventId);
  if (!order || !event) return undefined;
  signingKey ??= importSigningKey(DEV_QR_PRIVATE_KEY);
  return {
    id: t.id,
    code: t.code,
    holderName: t.holderName,
    tierName: event.tiers.find((tier) => tier.id === order.tierId)?.name ?? '',
    index: t.index,
    count: order.quantity,
    event,
    passSecret: t.secret,
    qrPayload: await signTicketQr(await signingKey, t.id),
    checkedInAt: t.checkedInAt,
  };
}

export const getTicket = (id: string, events: PublicEvent[]) => {
  const t = db.tickets[id];
  return t ? toTicketView(t, events) : Promise.resolve(undefined);
};

/** All tickets bought with this phone number, soonest event first. */
export async function ticketsForPhone(phone: string, events: PublicEvent[]) {
  const views = await Promise.all(
    Object.values(db.tickets)
      .filter((t) => db.orders[t.orderId]?.buyer.phone === phone)
      .map((t) => toTicketView(t, events)),
  );
  return views
    .filter((v): v is TicketView => v !== undefined)
    .sort(
      (a, b) => Date.parse(a.event.startsAt) - Date.parse(b.event.startsAt) || a.index - b.index,
    );
}

/** One paid ticket for the demo phone, so "Find my tickets" has something to show before any purchase. */
export function seedDemoTicket(events: PublicEvent[]) {
  if (Object.keys(db.orders).length > 0) return;
  const event = events.find((e) => e.slug === 'sauti-sessions');
  if (!event) return;
  const order = createOrder(event, {
    eventId: event.id,
    tierId: 'tier_sauti_regular',
    quantity: 1,
    buyer: { name: 'Amina Otieno', phone: DEMO_TICKET_PHONE, email: 'amina@example.com' },
    paymentMethod: 'mpesa',
  });
  if ('id' in order) {
    order.status = 'paid';
    order.paymentRequestedAt = null;
    issueTickets(order, event);
    save();
  }
}

/** Paid tickets for an event, for the door guest list. */
export function ticketsForEvent(eventId: string) {
  return Object.values(db.tickets).flatMap((ticket) => {
    const order = db.orders[ticket.orderId];
    return order && order.eventId === eventId && order.status === 'paid' ? [{ ticket, order }] : [];
  });
}

/** Record a door check-in on a ticket. The earliest one stands. */
export function recordTicketCheckIn(ticketId: string, at: string, door: string) {
  const t = db.tickets[ticketId];
  if (!t || (t.checkedInAt && Date.parse(t.checkedInAt) <= Date.parse(at))) return;
  t.checkedInAt = at;
  t.checkedInDoor = door;
  save();
}
