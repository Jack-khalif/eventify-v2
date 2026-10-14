import {
  formatDate,
  generatePassSecret,
  importSigningKey,
  isCheckoutError,
  ORDER_HOLD_MINUTES,
  randomToken,
  signTicketQr,
  validateCheckout,
  validateComp,
  type CheckoutRequest,
  tierRemaining,
  type CompList,
  type CompRequest,
  type CompRow,
  type OrderView,
  type PublicEvent,
  type TicketTransferRequest,
  type TicketTransferResult,
  type TicketView,
} from '@eventify/shared';
import { DEV_QR_PRIVATE_KEY } from './devKeys';
import { eventRate } from './rates';
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
  /** Set on a ticket passed on to someone other than the buyer. */
  holderEmail?: string;
  transferredFromId?: string;
  /** Set once passed on; the ticket stops working. */
  transferredAt?: string;
};
type StoredComp = CompRow & { orderId: string; eventId: string; tierId: string };
type Db = {
  orders: Record<string, OrderView>;
  tickets: Record<string, StoredTicket>;
  /** Missing in data saved before comps existed. */
  comps?: StoredComp[];
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
    // The rate in force when the order is placed; later rate changes don't touch it.
    rateBps: eventRate(event.organizer.id, event.id),
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
    index: t.transferredFromId ? 1 : t.index,
    count: t.transferredFromId ? 1 : order.quantity,
    event,
    passSecret: t.secret,
    qrPayload: await signTicketQr(await signingKey, t.id),
    checkedInAt: t.checkedInAt,
  };
}

export const getTicket = (id: string, events: PublicEvent[]) => {
  const t = db.tickets[id];
  return t && !t.transferredAt ? toTicketView(t, events) : Promise.resolve(undefined);
};

/** Why a ticket link stopped working, if it was passed on; worded as the API words it. */
export function transferredAway(id: string) {
  const old = db.tickets[id];
  if (!old?.transferredAt) return undefined;
  const next = Object.values(db.tickets).find((t) => t.transferredFromId === id);
  const [name = '', domain = ''] = (next?.holderEmail ?? '').split('@');
  return {
    status: 410 as const,
    error: 'transferred',
    message: `This ticket was transferred${next ? ` to ${name.slice(0, 1)}•••@${domain}` : ''} on ${formatDate(old.transferredAt)}, so it no longer works. They have a new ticket of their own.`,
  };
}

/** Tickets bought with this phone number and still held by the buyer, soonest event first. */
export const ticketsForPhone = (phone: string, events: PublicEvent[]) =>
  ticketsWhere((order, t) => order.buyer.phone === phone && !t.holderEmail, events);

async function ticketsWhere(
  matches: (order: OrderView, ticket: StoredTicket) => boolean,
  events: PublicEvent[],
) {
  const views = await Promise.all(
    Object.values(db.tickets)
      .filter((t) => {
        const order = db.orders[t.orderId];
        return order !== undefined && !t.transferredAt && matches(order, t);
      })
      .map((t) => toTicketView(t, events)),
  );
  return views
    .filter((v): v is TicketView => v !== undefined)
    .sort(
      (a, b) => Date.parse(a.event.startsAt) - Date.parse(b.event.startsAt) || a.index - b.index,
    );
}

/** All tickets held by this email address (what a signed-in buyer sees), soonest event first. */
export const ticketsForEmail = (email: string, events: PublicEvent[]) =>
  ticketsWhere((order, t) => (t.holderEmail ?? order.buyer.email).toLowerCase() === email, events);

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
    return order && order.eventId === eventId && order.status === 'paid' && !ticket.transferredAt
      ? [{ ticket, order }]
      : [];
  });
}

/** Tickets for an event that were passed on, so the door can say so when an old pass turns up. */
export const transferredForEvent = (eventId: string) =>
  Object.values(db.tickets)
    .filter((t) => t.transferredAt && db.orders[t.orderId]?.eventId === eventId)
    .map((t) => ({ ticketId: t.id, code: t.code, passSecret: t.secret }));

/** Record a door check-in on a ticket. The earliest one stands. */
export function recordTicketCheckIn(ticketId: string, at: string, door: string) {
  const t = db.tickets[ticketId];
  if (!t || t.transferredAt || (t.checkedInAt && Date.parse(t.checkedInAt) <= Date.parse(at)))
    return;
  t.checkedInAt = at;
  t.checkedInDoor = door;
  save();
}

const compsFor = (eventId: string) => (db.comps ?? []).filter((c) => c.eventId === eventId);

/** Complimentary tickets issued for an event, newest first, and the tiers to pick from. */
export const compList = (event: PublicEvent): CompList => ({
  comps: compRows(event.id),
  tiers: withComps(event).tiers.map((t) => ({
    id: t.id,
    name: t.name,
    remaining: tierRemaining(t),
  })),
});

const compRows = (eventId: string): CompRow[] =>
  compsFor(eventId)
    .map(({ name, email, tierName, quantity, issuedAt, emailed }) => ({
      name,
      email,
      tierName,
      quantity,
      issuedAt,
      emailed,
    }))
    .reverse();

export const compsIssued = (eventId: string) =>
  compsFor(eventId).reduce((sum, c) => sum + c.quantity, 0);

/** Free tickets from the organizer, issued at once. Nothing is emailed; it shows as sent. */
export function issueComps(event: PublicEvent, req: CompRequest, now = Date.now()) {
  const check = validateComp(withComps(event), req, new Date(now));
  if (isCheckoutError(check)) return check;

  db.sequence += 1;
  const order: OrderView = {
    id: `ord_${String(db.sequence).padStart(5, '0')}`,
    eventId: event.id,
    tierId: check.tier.id,
    quantity: req.quantity,
    totalMinor: 0,
    currency: event.currency,
    buyer: { name: req.name, phone: req.phone ?? '', email: req.email },
    paymentMethod: null,
    status: 'paid',
    failureReason: null,
    paymentRequestedAt: null,
    holdExpiresAt: iso(now),
    rateBps: 0,
    createdAt: iso(now),
    tickets: [],
  };
  issueTickets(order, event);
  db.orders[order.id] = order;
  (db.comps ??= []).push({
    orderId: order.id,
    eventId: event.id,
    tierId: check.tier.id,
    name: req.name,
    email: req.email,
    tierName: check.tier.name,
    quantity: req.quantity,
    issuedAt: iso(now),
    emailed: true,
  });
  save();
  return compList(event);
}

/** Sample tiers' sold counts don't move with mock orders, so earlier comps are counted here. */
function withComps(event: PublicEvent): PublicEvent {
  const issued = compsFor(event.id);
  return {
    ...event,
    tiers: event.tiers.map((t) => ({
      ...t,
      sold: t.sold + issued.filter((c) => c.tierId === t.id).reduce((n, c) => n + c.quantity, 0),
    })),
  };
}

/** Pass a ticket on, as the API does: a new ticket for them, and this one stops working. */
export function transferTicket(
  id: string,
  req: TicketTransferRequest,
  events: PublicEvent[],
  now = Date.now(),
): TicketTransferResult | { status: 404 | 409 | 410 | 422; error: string; message: string } {
  const t = db.tickets[id];
  const order = t && db.orders[t.orderId];
  const event = order && events.find((e) => e.id === order.eventId);
  if (!t || !order || !event) return { status: 404, error: 'not_found', message: 'Not found' };
  const gone = transferredAway(id);
  if (gone) return gone;
  if (t.checkedInAt) {
    return {
      status: 409,
      error: 'checked_in',
      message: 'This ticket has already been used at the door, so it can’t be passed on.',
    };
  }
  if (Date.parse(event.endsAt) <= now) {
    return { status: 409, error: 'event_ended', message: 'This event has ended.' };
  }
  if ((t.holderEmail ?? order.buyer.email).toLowerCase() === req.email.toLowerCase()) {
    return {
      status: 422,
      error: 'same_holder',
      message: 'This ticket is already theirs. Enter the email of the person taking it.',
    };
  }
  db.sequence += 1;
  const fresh: StoredTicket = {
    id: randomToken(),
    code: `EVT-${event.id.replace(/^evt_/, '').toUpperCase()}-${String(4820 + db.sequence).padStart(4, '0')}`,
    orderId: order.id,
    index: t.index,
    holderName: req.name,
    holderEmail: req.email,
    secret: generatePassSecret(),
    checkedInAt: null,
    transferredFromId: t.id,
  };
  db.tickets[fresh.id] = fresh;
  t.transferredAt = iso(now);
  order.tickets = order.tickets.filter((x) => x.id !== t.id);
  save();
  return { email: req.email, emailed: true };
}
