import {
  CITY_CURRENCY,
  DEFAULT_RATE_BPS,
  decideRateChange,
  displayStatus,
  feeFor,
  isRateError,
  overviewQuerySchema,
  toEatIso,
  type AdminAgentRow,
  type AdminApprovalRow,
  type AdminMe,
  type AdminOrganizerDetail,
  type AdminOrganizerRow,
  type AdminOverview,
  type AdminPayoutRow,
  type AdminRole,
  type Currency,
  type MoneyByCurrency,
  type Organizer,
  type OverviewQuery,
  type RateChangeRequest,
} from '@eventify/shared';
import {
  agents,
  HISTORY_DAYS,
  mpesaDaily,
  organizerDailySalesMinor,
  organizerSalesMinor,
  organizers,
  payouts as samplePayouts,
} from '@eventify/shared/fixtures';
import { allEvents } from './events';
import {
  eventOverride,
  eventRate,
  organizerRate,
  pendingApprovals,
  rateHistory,
  recordRateChange,
  requestApproval,
  resolveApproval,
} from './rates';

/**
 * In-browser stand-in for the admin API until the backend exists. Who is signed in is a demo
 * switch (Super Admin, or agent Grace Achieng) until sign-in arrives in Phase A9.
 */

type StoredPayout = AdminPayoutRow;
type Db = { role: AdminRole; payouts: Record<string, { reference: string; paidAt: string }> };

const STORAGE_KEY = 'eventify-mock-admin';
const DEMO_AGENT_ID = 'agent_grace';
let db: Db = load();

function empty(): Db {
  return { role: 'super_admin', payouts: {} };
}

function load(): Db {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Db;
  } catch {
    // Storage blocked or corrupt: start fresh.
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

export function resetAdmin() {
  db = empty();
}

export type AdminError = { status: 403 | 404 | 409 | 422; error: string; message: string };
export const isAdminError = (x: unknown): x is AdminError =>
  typeof x === 'object' && x !== null && 'status' in x && 'error' in x;

const forbidden: AdminError = {
  status: 403,
  error: 'forbidden',
  message: "You don't have access to that.",
};
const notFound: AdminError = { status: 404, error: 'not_found', message: 'Not found' };

export function adminMe(): AdminMe {
  return db.role === 'agent'
    ? {
        role: 'agent',
        name: agents.find((a) => a.id === DEMO_AGENT_ID)!.name,
        agentId: DEMO_AGENT_ID,
      }
    : { role: 'super_admin', name: 'Super Admin', agentId: null };
}

export function setDemoRole(role: AdminRole) {
  db.role = role;
  save();
  return adminMe();
}

/** Agents only see organizers they onboarded. */
const visibleOrganizers = (me: AdminMe) =>
  organizers.filter((o) => me.role === 'super_admin' || o.agentId === me.agentId);

const currencyOf = (o: Organizer): Currency => CITY_CURRENCY[o.city];
const agentOf = (o: Organizer) => agents.find((a) => a.id === o.agentId) ?? null;

function row(o: Organizer): AdminOrganizerRow {
  return {
    id: o.id,
    handle: o.handle,
    name: o.name,
    category: o.category,
    city: o.city,
    currency: currencyOf(o),
    agent: agentOf(o),
    rateBps: organizerRate(o.id),
    salesMinor: organizerSalesMinor[o.id] ?? 0,
    status: o.status,
  };
}

function payoutRows(): StoredPayout[] {
  return samplePayouts.map((p) => {
    const o = organizers.find((x) => x.id === p.organizerId)!;
    const paid = db.payouts[p.id];
    return {
      ...p,
      status: paid ? 'paid' : p.status,
      organizerName: o.name,
      handle: o.handle,
      currency: currencyOf(o),
      reference: paid?.reference ?? null,
      paidAt: paid?.paidAt ?? null,
    };
  });
}

function addTo(list: MoneyByCurrency, currency: Currency, amountMinor: number) {
  const entry = list.find((m) => m.currency === currency);
  if (entry) entry.amountMinor += amountMinor;
  else list.push({ currency, amountMinor });
}

export function overview(me: AdminMe, query: OverviewQuery, now = new Date()): AdminOverview {
  const q = overviewQuerySchema.parse(query);
  const orgs = visibleOrganizers(me).filter(
    (o) => (!q.city || o.city === q.city) && (!q.category || o.category === q.category),
  );
  const inCurrency = orgs.filter((o) => currencyOf(o) === q.currency);
  const from = HISTORY_DAYS - q.days;

  const daily = Array<number>(q.days).fill(0);
  const fees = new Map<string, number>();
  for (const o of inCurrency) {
    const days = organizerDailySalesMinor(o.id).slice(from);
    days.forEach((d, i) => (daily[i]! += d));
    const gross = days.reduce((a, d) => a + d, 0);
    fees.set(o.id, feeFor(gross, organizerRate(o.id)));
  }

  const orgIds = new Set(orgs.map((o) => o.id));
  const pending = payoutRows().filter((p) => orgIds.has(p.organizerId) && p.status !== 'paid');
  const pendingPayouts: MoneyByCurrency = [];
  for (const p of pending) addTo(pendingPayouts, p.currency, p.amountMinor);

  const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);
  const failures = (Object.keys(mpesaDaily.failures) as (keyof typeof mpesaDaily.failures)[]).map(
    (reason) => ({ reason, count: sum(mpesaDaily.failures[reason].slice(from)) }),
  );
  const attempts = sum(mpesaDaily.attempts.slice(from));

  return {
    currency: q.currency,
    days: q.days,
    grossMinor: sum(daily),
    feesMinor: sum([...fees.values()]),
    dailyGrossMinor: daily,
    pendingPayouts,
    pendingPayoutCount: pending.length,
    liveEvents: allEvents().filter(
      (e) => orgIds.has(e.organizerId) && displayStatus(e, now) === 'live',
    ).length,
    activeOrganizers: orgs.filter((o) => o.status === 'active').length,
    organizerCount: orgs.length,
    avgRateBps: orgs.length
      ? Math.round(sum(orgs.map((o) => organizerRate(o.id))) / orgs.length)
      : DEFAULT_RATE_BPS,
    topOrganizers: inCurrency
      .map((o) => ({ handle: o.handle, name: o.name, feesMinor: fees.get(o.id) ?? 0 }))
      .filter((o) => o.feesMinor > 0)
      .sort((a, b) => b.feesMinor - a.feesMinor)
      .slice(0, 5),
    payments: { attempts, succeeded: attempts - sum(failures.map((f) => f.count)), failures },
  };
}

export const organizerRows = (me: AdminMe) => visibleOrganizers(me).map(row);

function findVisible(me: AdminMe, handle: string): Organizer | AdminError {
  const o = organizers.find((x) => x.handle === handle);
  if (!o) return notFound;
  return visibleOrganizers(me).includes(o) ? o : forbidden;
}

export function organizerDetail(
  me: AdminMe,
  handle: string,
  now = new Date(),
): AdminOrganizerDetail | AdminError {
  const o = findVisible(me, handle);
  if (isAdminError(o)) return o;
  const events = allEvents().filter((e) => e.organizerId === o.id);
  return {
    ...row(o),
    type: o.type,
    payoutMethod: o.payoutMethod,
    events: events
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
      .map((e) => ({
        id: e.id,
        title: e.title,
        startsAt: e.startsAt,
        status: displayStatus(e, now),
        rateBps: eventOverride(e.id),
      })),
    rateHistory: rateHistory(o.id).map((c) => ({
      ...c,
      eventTitle: c.eventId ? (events.find((e) => e.id === c.eventId)?.title ?? null) : null,
    })),
    pendingApproval: pendingApprovals().find((a) => a.organizerId === o.id) ?? null,
    payout: payoutRows().find((p) => p.organizerId === o.id) ?? null,
  };
}

export function changeRate(
  me: AdminMe,
  handle: string,
  req: RateChangeRequest,
  now = new Date(),
): { outcome: 'applied' | 'sent_for_approval' } | AdminError {
  const o = findVisible(me, handle);
  if (isAdminError(o)) return o;
  if (req.eventId) {
    const event = allEvents().find((e) => e.id === req.eventId && e.organizerId === o.id);
    if (!event || displayStatus(event, now) !== 'live') {
      return {
        status: 422,
        error: 'event_not_upcoming',
        message: 'Pick one of this organizer’s upcoming events.',
      };
    }
  }
  const current = req.eventId ? eventRate(o.id, req.eventId) : organizerRate(o.id);
  const decision = decideRateChange(me.role, req, current);
  if (isRateError(decision)) return decision;

  if (decision.outcome === 'sent_for_approval') {
    requestApproval(
      {
        organizerId: o.id,
        agentId: me.agentId!,
        requestedBps: req.rateBps,
        reason: req.reason.trim(),
        eventId: req.eventId,
      },
      now.getTime(),
    );
  } else {
    recordRateChange(
      {
        organizerId: o.id,
        oldBps: current,
        newBps: req.rateBps,
        reason: req.reason.trim(),
        changedBy: me.name,
        eventId: req.eventId,
      },
      now.getTime(),
    );
  }
  return decision;
}

export function approvalRows(): AdminApprovalRow[] {
  const events = allEvents();
  return pendingApprovals().map((a) => {
    const o = organizers.find((x) => x.id === a.organizerId)!;
    return {
      ...a,
      organizerName: o.name,
      handle: o.handle,
      agentName: agents.find((x) => x.id === a.agentId)?.name ?? a.agentId,
      currentBps: a.eventId ? eventRate(o.id, a.eventId) : organizerRate(o.id),
      eventTitle: a.eventId ? (events.find((e) => e.id === a.eventId)?.title ?? null) : null,
    };
  });
}

export function resolve(
  me: AdminMe,
  id: string,
  decision: 'approved' | 'rejected',
  now = new Date(),
): { ok: true } | AdminError {
  if (me.role !== 'super_admin') return forbidden;
  const a = resolveApproval(id, decision);
  if (!a) {
    return { status: 409, error: 'already_resolved', message: 'This request was already handled.' };
  }
  if (decision === 'approved') {
    const agentName = agents.find((x) => x.id === a.agentId)?.name ?? a.agentId;
    recordRateChange(
      {
        organizerId: a.organizerId,
        oldBps: a.eventId ? eventRate(a.organizerId, a.eventId) : organizerRate(a.organizerId),
        newBps: a.requestedBps,
        reason: a.reason,
        changedBy: `${agentName}, approved by ${me.name}`,
        eventId: a.eventId,
      },
      now.getTime(),
    );
  }
  return { ok: true };
}

export function agentRows(): AdminAgentRow[] {
  return agents.map((a) => {
    const mine = organizers.filter((o) => o.agentId === a.id);
    const sales: MoneyByCurrency = [];
    const fees: MoneyByCurrency = [];
    for (const o of mine) {
      const gross = organizerSalesMinor[o.id] ?? 0;
      addTo(sales, currencyOf(o), gross);
      addTo(fees, currencyOf(o), feeFor(gross, organizerRate(o.id)));
    }
    return {
      ...a,
      organizers: mine.length,
      sales,
      fees,
      avgRateBps: mine.length
        ? Math.round(mine.reduce((x, o) => x + organizerRate(o.id), 0) / mine.length)
        : null,
    };
  });
}

export const payoutsFor = (me: AdminMe) => {
  const ids = new Set(visibleOrganizers(me).map((o) => o.id));
  return payoutRows().filter((p) => ids.has(p.organizerId));
};

export function markPaid(
  me: AdminMe,
  id: string,
  reference: string,
  now = Date.now(),
): AdminPayoutRow | AdminError {
  if (me.role !== 'super_admin') return forbidden;
  const payout = payoutRows().find((p) => p.id === id);
  if (!payout) return notFound;
  if (payout.status === 'paid') {
    return { status: 409, error: 'already_paid', message: 'This payout is already marked paid.' };
  }
  db.payouts[id] = { reference: reference.toUpperCase(), paidAt: toEatIso(now) };
  save();
  return payoutRows().find((p) => p.id === id)!;
}
