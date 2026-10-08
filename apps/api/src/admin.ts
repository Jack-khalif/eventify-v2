import {
  canMoveOrganizerStatus,
  CITY_CURRENCY,
  decideRateChange,
  DEFAULT_RATE_BPS,
  isRateError,
  ORDER_HOLD_MINUTES,
  overviewQuerySchema,
  type AdminAgentRow,
  type AdminApplicationRow,
  type AdminApprovalRow,
  type AdminMe,
  type AdminOrganizerDetail,
  type AdminOrganizerRow,
  type AdminOverview,
  type AdminPayoutRow,
  type Agent,
  type Currency,
  type MoneyByCurrency,
  type OrganizerStatus,
  type RateChangeRequest,
} from '@eventify/shared';
import { and, asc, count, desc, eq, gt, gte, inArray, lte, ne, notExists, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import type { z } from 'zod';
import type { AccountRow } from './auth';
import type { Db } from './db/client';
import {
  agents,
  events,
  orders,
  organizerApplications,
  organizers,
  paymentAttempts,
  payouts,
  rateApprovals,
  rateChanges,
} from './db/schema';
import { eatDay, eatDaySql, eatDayStart, eatIso } from './time';

/** The admin portal's API. Agents see the organizers they onboarded; the rest is Super Admin only. */

export type AdminDeps = { db: Db; now: () => number };
export type AdminError = { status: 403 | 404 | 409 | 422; error: string; message: string };
export const isAdminError = (x: unknown): x is AdminError =>
  typeof x === 'object' && x !== null && 'status' in x && 'error' in x;

type OrganizerRow = typeof organizers.$inferSelect;
type OverviewFilters = z.output<typeof overviewQuerySchema>;

const forbidden: AdminError = {
  status: 403,
  error: 'forbidden',
  message: "You don't have access to that.",
};
const notFound: AdminError = { status: 404, error: 'not_found', message: 'Not found' };

const newId = (prefix: string) => `${prefix}_${randomBytes(6).toString('hex')}`;
const currencyOf = (o: OrganizerRow): Currency => CITY_CURRENCY[o.city];
/** Sums come back as numbers; money here stays far below where a double stops being exact. */
const total = (amount: unknown) => sql<number>`coalesce(sum(${amount}), 0)::float8`;
/** Eventify's fee on each order at the rate it was sold at, rounded per order as feeFor() does. */
const feeSum = total(sql`round(${orders.totalMinor} * ${orders.rateBps} / 10000.0)`);

/** The admin portal's view of a signed-in account; null for anyone who isn't staff. */
export function adminMe(account: AccountRow): AdminMe | null {
  const name = account.name || account.email;
  if (account.role === 'super_admin') return { role: 'super_admin', name, agentId: null };
  if (account.role === 'agent' && account.agentId) {
    return { role: 'agent', name, agentId: account.agentId };
  }
  return null;
}

const canSee = (me: AdminMe, o: OrganizerRow) =>
  me.role === 'super_admin' || o.agentId === me.agentId;

const visibleOrganizers = (db: Db, me: AdminMe) =>
  db
    .select()
    .from(organizers)
    .where(me.role === 'super_admin' ? undefined : eq(organizers.agentId, me.agentId!))
    .orderBy(asc(organizers.name));

async function agentsById(db: Db) {
  return new Map((await db.select().from(agents)).map((a): [string, Agent] => [a.id, a]));
}

/** Lifetime paid sales per organizer id. */
async function salesByOrganizer(db: Db) {
  const rows = await db
    .select({ organizerId: events.organizerId, gross: total(orders.totalMinor), fees: feeSum })
    .from(orders)
    .innerJoin(events, eq(orders.eventId, events.id))
    .where(eq(orders.status, 'paid'))
    .groupBy(events.organizerId);
  return new Map(rows.map((r) => [r.organizerId, r]));
}

const toRow = (
  o: OrganizerRow,
  agentMap: Map<string, Agent>,
  sales: Awaited<ReturnType<typeof salesByOrganizer>>,
): AdminOrganizerRow => ({
  id: o.id,
  handle: o.handle,
  name: o.name,
  category: o.category,
  city: o.city,
  currency: currencyOf(o),
  agent: (o.agentId && agentMap.get(o.agentId)) || null,
  rateBps: o.rateBps,
  salesMinor: sales.get(o.id)?.gross ?? 0,
  status: o.status,
});

export async function organizerRows(db: Db, me: AdminMe): Promise<AdminOrganizerRow[]> {
  const [orgs, agentMap, sales] = await Promise.all([
    visibleOrganizers(db, me),
    agentsById(db),
    salesByOrganizer(db),
  ]);
  return orgs.map((o) => toRow(o, agentMap, sales));
}

// ── Payouts ─────────────────────────────────────────────────────────────────

/**
 * Write the payout for every event that has ended and doesn't have one yet: its paid orders less
 * the fee each was sold at. Waits out the checkout hold first, so a payment still in flight when
 * the event ended is counted. Events that sold nothing get no payout.
 */
async function settleEndedEvents(db: Db, now: number) {
  const final = new Date(now - ORDER_HOLD_MINUTES * 60_000);
  const due = await db
    .select({
      eventId: events.id,
      organizerId: events.organizerId,
      currency: events.currency,
      method: organizers.payoutMethod,
      gross: total(orders.totalMinor),
      fees: feeSum,
    })
    .from(events)
    .innerJoin(organizers, eq(events.organizerId, organizers.id))
    .innerJoin(orders, and(eq(orders.eventId, events.id), eq(orders.status, 'paid')))
    .where(
      and(
        lte(events.endsAt, final),
        ne(events.status, 'draft'),
        notExists(
          db.select({ id: payouts.id }).from(payouts).where(eq(payouts.eventId, events.id)),
        ),
      ),
    )
    .groupBy(events.id, organizers.payoutMethod);
  const rows = due
    .filter((d) => d.gross - d.fees > 0)
    .map((d) => ({
      id: newId('po'),
      organizerId: d.organizerId,
      eventId: d.eventId,
      amountMinor: d.gross - d.fees,
      currency: d.currency,
      method: d.method,
      status: 'pending' as const,
      createdAt: new Date(now),
    }));
  // Two admins loading the page together both find the same events; the second insert is dropped.
  if (rows.length) await db.insert(payouts).values(rows).onConflictDoNothing();
}

type PayoutRow = { payout: typeof payouts.$inferSelect; organizer: OrganizerRow };

const toPayoutRow = ({ payout: p, organizer: o }: PayoutRow): AdminPayoutRow => ({
  id: p.id,
  organizerId: p.organizerId,
  amountMinor: p.amountMinor,
  method: p.method,
  status: p.status,
  organizerName: o.name,
  handle: o.handle,
  currency: p.currency,
  reference: p.reference,
  paidAt: p.paidAt && eatIso(p.paidAt),
});

/** Payouts for the organizers this person can see: unpaid first (oldest first), then paid. */
async function payoutRows({ db, now }: AdminDeps, me: AdminMe): Promise<AdminPayoutRow[]> {
  await settleEndedEvents(db, now());
  const rows = await db
    .select({ payout: payouts, organizer: organizers })
    .from(payouts)
    .innerJoin(organizers, eq(payouts.organizerId, organizers.id))
    .where(me.role === 'super_admin' ? undefined : eq(organizers.agentId, me.agentId!))
    .orderBy(sql`${payouts.status} = 'paid'`, asc(payouts.createdAt), asc(payouts.id));
  return rows.map(toPayoutRow);
}

export const payoutsFor = payoutRows;

export async function markPaid(
  { db, now }: AdminDeps,
  me: AdminMe,
  id: string,
  reference: string,
): Promise<AdminPayoutRow | AdminError> {
  if (me.role !== 'super_admin') return forbidden;
  // One statement, so two admins can't both mark the same payout paid.
  const [paid] = await db
    .update(payouts)
    .set({ status: 'paid', reference: reference.toUpperCase(), paidAt: new Date(now()) })
    .where(and(eq(payouts.id, id), ne(payouts.status, 'paid')))
    .returning();
  if (!paid) {
    const [existing] = await db.select({ id: payouts.id }).from(payouts).where(eq(payouts.id, id));
    return existing
      ? { status: 409, error: 'already_paid', message: 'This payout is already marked paid.' }
      : notFound;
  }
  const [organizer] = await db.select().from(organizers).where(eq(organizers.id, paid.organizerId));
  return toPayoutRow({ payout: paid, organizer: organizer! });
}

// ── Overview ────────────────────────────────────────────────────────────────

function addTo(list: MoneyByCurrency, currency: Currency, amountMinor: number) {
  const entry = list.find((m) => m.currency === currency);
  if (entry) entry.amountMinor += amountMinor;
  else list.push({ currency, amountMinor });
}

const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);

export async function overview(
  deps: AdminDeps,
  me: AdminMe,
  q: OverviewFilters,
): Promise<AdminOverview> {
  const { db } = deps;
  const at = deps.now();
  const orgs = (await visibleOrganizers(db, me)).filter(
    (o) => (!q.city || o.city === q.city) && (!q.category || o.category === q.category),
  );
  const orgIds = orgs.map((o) => o.id);
  const today = eatDay(at);
  const firstDay = today - q.days + 1;
  const since = eatDayStart(firstDay);

  const daily = Array<number>(q.days).fill(0);
  const fees = new Map<string, number>();
  const attempts = { total: 0, paid: 0, failed: new Map<string, number>() };
  let liveEvents = 0;

  if (orgIds.length) {
    // Money for the chosen currency only: KSh and SSP are never added together.
    const inRange = and(
      inArray(events.organizerId, orgIds),
      eq(orders.currency, q.currency),
      gte(orders.paidAt, since),
    );
    const sales = await db
      .select({
        day: eatDaySql(orders.paidAt),
        organizerId: events.organizerId,
        gross: total(orders.totalMinor),
        fees: feeSum,
      })
      .from(orders)
      .innerJoin(events, eq(orders.eventId, events.id))
      .where(and(inRange, eq(orders.status, 'paid')))
      .groupBy(eatDaySql(orders.paidAt), events.organizerId);
    for (const s of sales) {
      daily[s.day - firstDay]! += s.gross;
      fees.set(s.organizerId, (fees.get(s.organizerId) ?? 0) + s.fees);
    }

    const prompts = await db
      .select({ outcome: paymentAttempts.outcome, count: count() })
      .from(paymentAttempts)
      .innerJoin(orders, eq(paymentAttempts.orderId, orders.id))
      .innerJoin(events, eq(orders.eventId, events.id))
      .where(
        and(
          inArray(events.organizerId, orgIds),
          eq(orders.currency, q.currency),
          gte(paymentAttempts.requestedAt, since),
        ),
      )
      .groupBy(paymentAttempts.outcome);
    for (const p of prompts) {
      attempts.total += p.count;
      if (p.outcome === 'paid') attempts.paid += p.count;
      else if (p.outcome) attempts.failed.set(p.outcome, p.count);
    }

    const [live] = await db
      .select({ count: count() })
      .from(events)
      .where(
        and(
          inArray(events.organizerId, orgIds),
          eq(events.status, 'live'),
          gt(events.endsAt, new Date(at)),
        ),
      );
    liveEvents = live?.count ?? 0;
  }

  const idSet = new Set(orgIds);
  const pending = (await payoutRows(deps, me)).filter(
    (p) => idSet.has(p.organizerId) && p.status !== 'paid',
  );
  const pendingPayouts: MoneyByCurrency = [];
  for (const p of pending) addTo(pendingPayouts, p.currency, p.amountMinor);

  return {
    currency: q.currency,
    days: q.days,
    grossMinor: sum(daily),
    feesMinor: sum([...fees.values()]),
    dailyGrossMinor: daily,
    pendingPayouts,
    pendingPayoutCount: pending.length,
    liveEvents,
    activeOrganizers: orgs.filter((o) => o.status === 'active').length,
    organizerCount: orgs.length,
    avgRateBps: orgs.length
      ? Math.round(sum(orgs.map((o) => o.rateBps)) / orgs.length)
      : DEFAULT_RATE_BPS,
    topOrganizers: orgs
      .map((o) => ({ handle: o.handle, name: o.name, feesMinor: fees.get(o.id) ?? 0 }))
      .filter((o) => o.feesMinor > 0)
      .sort((a, b) => b.feesMinor - a.feesMinor)
      .slice(0, 5),
    payments: {
      attempts: attempts.total,
      succeeded: attempts.paid,
      failures: (['insufficient_funds', 'cancelled_by_user', 'wrong_pin', 'timeout'] as const).map(
        (reason) => ({ reason, count: attempts.failed.get(reason) ?? 0 }),
      ),
    },
  };
}

// ── One organizer ───────────────────────────────────────────────────────────

async function findVisible(
  db: Db,
  me: AdminMe,
  handle: string,
): Promise<OrganizerRow | AdminError> {
  const [o] = await db.select().from(organizers).where(eq(organizers.handle, handle));
  if (!o) return notFound;
  return canSee(me, o) ? o : forbidden;
}

const isLive = (e: typeof events.$inferSelect, now: number) =>
  e.status === 'live' && e.endsAt.getTime() > now;

const toApproval = (a: typeof rateApprovals.$inferSelect) => ({
  id: a.id,
  organizerId: a.organizerId,
  agentId: a.agentId,
  requestedBps: a.requestedBps,
  eventId: a.eventId,
  reason: a.reason,
  requestedAt: eatIso(a.requestedAt),
  status: a.status,
});

export async function organizerDetail(
  deps: AdminDeps,
  me: AdminMe,
  handle: string,
): Promise<AdminOrganizerDetail | AdminError> {
  const { db } = deps;
  const at = deps.now();
  const o = await findVisible(db, me, handle);
  if (isAdminError(o)) return o;

  const [agentMap, sales, own, history, [approval], allPayouts] = await Promise.all([
    agentsById(db),
    salesByOrganizer(db),
    db.select().from(events).where(eq(events.organizerId, o.id)).orderBy(asc(events.startsAt)),
    db
      .select()
      .from(rateChanges)
      .where(eq(rateChanges.organizerId, o.id))
      .orderBy(desc(rateChanges.at)),
    db
      .select()
      .from(rateApprovals)
      .where(and(eq(rateApprovals.organizerId, o.id), eq(rateApprovals.status, 'pending')))
      .orderBy(desc(rateApprovals.requestedAt))
      .limit(1),
    payoutRows(deps, me),
  ]);
  const titleOf = (eventId: string | null) =>
    (eventId && own.find((e) => e.id === eventId)?.title) || null;
  // The one that needs attention: the oldest still unpaid, otherwise the last one paid.
  const mine = allPayouts.filter((p) => p.organizerId === o.id);

  return {
    ...toRow(o, agentMap, sales),
    type: o.type,
    payoutMethod: o.payoutMethod,
    events: own.map((e) => ({
      id: e.id,
      title: e.title,
      startsAt: eatIso(e.startsAt),
      status: e.status === 'live' && !isLive(e, at) ? 'ended' : e.status,
      rateBps: e.rateBps,
    })),
    rateHistory: history.map((c) => ({
      id: c.id,
      organizerId: c.organizerId,
      oldBps: c.oldBps,
      newBps: c.newBps,
      reason: c.reason,
      changedBy: c.changedBy,
      at: eatIso(c.at),
      eventId: c.eventId,
      eventTitle: titleOf(c.eventId),
    })),
    pendingApproval: approval ? toApproval(approval) : null,
    payout: mine.find((p) => p.status !== 'paid') ?? mine.at(-1) ?? null,
  };
}

// ── Rates ───────────────────────────────────────────────────────────────────

type RateTarget = { organizerId: string; eventId: string | null };

/** The rate a new sale would be charged right now. Locks the rows, so call inside a transaction. */
async function currentRate(tx: Db, { organizerId, eventId }: RateTarget): Promise<number> {
  const [o] = await tx
    .select({ rateBps: organizers.rateBps })
    .from(organizers)
    .where(eq(organizers.id, organizerId))
    .for('update');
  if (!eventId) return o!.rateBps;
  const [e] = await tx
    .select({ rateBps: events.rateBps })
    .from(events)
    .where(eq(events.id, eventId));
  return e?.rateBps ?? o!.rateBps;
}

/** Set the rate and keep the history. Orders already placed keep the rate they were sold at. */
async function applyRate(
  tx: Db,
  target: RateTarget,
  change: { oldBps: number; newBps: number; reason: string; changedBy: string },
  now: number,
) {
  if (target.eventId) {
    await tx.update(events).set({ rateBps: change.newBps }).where(eq(events.id, target.eventId));
  } else {
    await tx
      .update(organizers)
      .set({ rateBps: change.newBps })
      .where(eq(organizers.id, target.organizerId));
  }
  await tx.insert(rateChanges).values({ id: newId('rc'), ...target, ...change, at: new Date(now) });
}

export async function changeRate(
  { db, now }: AdminDeps,
  me: AdminMe,
  handle: string,
  req: RateChangeRequest,
): Promise<{ outcome: 'applied' | 'sent_for_approval' } | AdminError> {
  const at = now();
  const o = await findVisible(db, me, handle);
  if (isAdminError(o)) return o;
  if (req.eventId) {
    const [event] = await db
      .select()
      .from(events)
      .where(and(eq(events.id, req.eventId), eq(events.organizerId, o.id)));
    if (!event || !isLive(event, at)) {
      return {
        status: 422,
        error: 'event_not_upcoming',
        message: 'Pick one of this organizer’s upcoming events.',
      };
    }
  }
  const target = { organizerId: o.id, eventId: req.eventId };
  const reason = req.reason.trim();

  return db.transaction(async (tx) => {
    const current = await currentRate(tx, target);
    const decision = decideRateChange(me.role, req, current);
    if (isRateError(decision)) return decision;

    if (decision.outcome === 'applied') {
      await applyRate(
        tx,
        target,
        { oldBps: current, newBps: req.rateBps, reason, changedBy: me.name },
        at,
      );
      return decision;
    }
    // A newer request for the same organizer and event replaces the one still waiting.
    await tx
      .delete(rateApprovals)
      .where(
        and(
          eq(rateApprovals.organizerId, o.id),
          eq(rateApprovals.status, 'pending'),
          req.eventId
            ? eq(rateApprovals.eventId, req.eventId)
            : sql`${rateApprovals.eventId} is null`,
        ),
      );
    await tx.insert(rateApprovals).values({
      id: newId('ap'),
      ...target,
      agentId: me.agentId!,
      requestedBps: req.rateBps,
      reason,
      requestedAt: new Date(at),
      status: 'pending',
    });
    return decision;
  });
}

/** Rate requests waiting for a Super Admin, oldest first. */
export async function approvalRows(db: Db): Promise<AdminApprovalRow[]> {
  const rows = await db
    .select({ approval: rateApprovals, organizer: organizers, event: events })
    .from(rateApprovals)
    .innerJoin(organizers, eq(rateApprovals.organizerId, organizers.id))
    .leftJoin(events, eq(rateApprovals.eventId, events.id))
    .where(eq(rateApprovals.status, 'pending'))
    .orderBy(asc(rateApprovals.requestedAt));
  const agentMap = await agentsById(db);
  return rows.map(({ approval: a, organizer: o, event: e }) => ({
    ...toApproval(a),
    organizerName: o.name,
    handle: o.handle,
    agentName: agentMap.get(a.agentId)?.name ?? a.agentId,
    currentBps: e?.rateBps ?? o.rateBps,
    eventTitle: e?.title ?? null,
  }));
}

export async function resolveApproval(
  { db, now }: AdminDeps,
  me: AdminMe,
  id: string,
  decision: 'approved' | 'rejected',
): Promise<{ ok: true } | AdminError> {
  if (me.role !== 'super_admin') return forbidden;
  return db.transaction(async (tx) => {
    // Only a request still waiting can be decided, so it can't be approved twice.
    const [a] = await tx
      .update(rateApprovals)
      .set({ status: decision })
      .where(and(eq(rateApprovals.id, id), eq(rateApprovals.status, 'pending')))
      .returning();
    if (!a) {
      return {
        status: 409,
        error: 'already_resolved',
        message: 'This request was already handled.',
      } as const;
    }
    if (decision === 'approved') {
      const [agent] = await tx.select().from(agents).where(eq(agents.id, a.agentId));
      await applyRate(
        tx,
        a,
        {
          oldBps: await currentRate(tx, a),
          newBps: a.requestedBps,
          reason: a.reason,
          changedBy: `${agent?.name ?? a.agentId}, approved by ${me.name}`,
        },
        now(),
      );
    }
    return { ok: true } as const;
  });
}

// ── Agents, applications and organizer status ───────────────────────────────

export async function agentRows(db: Db): Promise<AdminAgentRow[]> {
  const [all, orgs, sales] = await Promise.all([
    db.select().from(agents).orderBy(asc(agents.name)),
    db.select().from(organizers),
    salesByOrganizer(db),
  ]);
  return all.map((a) => {
    const mine = orgs.filter((o) => o.agentId === a.id);
    const gross: MoneyByCurrency = [];
    const fees: MoneyByCurrency = [];
    for (const o of mine) {
      addTo(gross, currencyOf(o), sales.get(o.id)?.gross ?? 0);
      addTo(fees, currencyOf(o), sales.get(o.id)?.fees ?? 0);
    }
    return {
      ...a,
      organizers: mine.length,
      sales: gross,
      fees,
      avgRateBps: mine.length ? Math.round(sum(mine.map((o) => o.rateBps)) / mine.length) : null,
    };
  });
}

/** Organizers waiting for approval, oldest first, with what they told us when they applied. */
export async function applicationRows(db: Db): Promise<AdminApplicationRow[]> {
  const rows = await db
    .select({ application: organizerApplications, organizer: organizers })
    .from(organizerApplications)
    .innerJoin(organizers, eq(organizerApplications.organizerId, organizers.id))
    .where(eq(organizers.status, 'pending'))
    .orderBy(asc(organizerApplications.appliedAt));
  const agentMap = await agentsById(db);
  return rows.map(({ application: a, organizer: o }) => ({
    organizerId: o.id,
    handle: o.handle,
    name: o.name,
    type: o.type,
    category: o.category,
    city: o.city,
    agent: (o.agentId && agentMap.get(o.agentId)) || null,
    contactName: a.contactName,
    email: a.email,
    about: a.about,
    appliedAt: eatIso(a.appliedAt),
  }));
}

/** Approve, decline, suspend or reinstate an organizer. */
export async function setOrganizerStatus(
  deps: AdminDeps,
  me: AdminMe,
  handle: string,
  status: OrganizerStatus,
): Promise<AdminOrganizerDetail | AdminError> {
  if (me.role !== 'super_admin') return forbidden;
  const { db } = deps;
  const moved = await db.transaction(async (tx) => {
    const [o] = await tx
      .select()
      .from(organizers)
      .where(eq(organizers.handle, handle))
      .for('update');
    if (!o) return notFound;
    if (!canMoveOrganizerStatus(o.status, status)) {
      return {
        status: 409,
        error: 'status_conflict',
        message: `${o.name} is ${o.status}, so that change doesn't apply. Refresh and try again.`,
      } as const;
    }
    await tx.update(organizers).set({ status }).where(eq(organizers.id, o.id));
    return null;
  });
  return moved ?? organizerDetail(deps, me, handle);
}
