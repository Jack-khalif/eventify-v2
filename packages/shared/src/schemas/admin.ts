import { z } from 'zod';
import {
  categorySchema,
  citySchema,
  currencySchema,
  eventStatusSchema,
  organizerStatusSchema,
  payoutMethodSchema,
  payoutStatusSchema,
} from '../enums';
import { dateTimeSchema, idSchema, moneySchema, rateBpsSchema } from './common';
import { paymentFailureSchema } from './order';

export const agentSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
});
export type Agent = z.infer<typeof agentSchema>;

export const rateChangeSchema = z.object({
  id: idSchema,
  organizerId: idSchema,
  oldBps: rateBpsSchema,
  newBps: rateBpsSchema,
  reason: z.string().min(1),
  changedBy: z.string().min(1),
  at: dateTimeSchema,
  /** Set when the change applies to one upcoming event only. */
  eventId: idSchema.nullable(),
});
export type RateChange = z.infer<typeof rateChangeSchema>;

export const rateApprovalSchema = z.object({
  id: idSchema,
  organizerId: idSchema,
  agentId: idSchema,
  requestedBps: rateBpsSchema,
  /** Set when the request is for one upcoming event only. */
  eventId: idSchema.nullable(),
  reason: z.string().min(1),
  requestedAt: dateTimeSchema,
  status: z.enum(['pending', 'approved', 'rejected']),
});
export type RateApproval = z.infer<typeof rateApprovalSchema>;

export const payoutSchema = z.object({
  id: idSchema,
  organizerId: idSchema,
  amountMinor: moneySchema,
  method: payoutMethodSchema,
  status: payoutStatusSchema,
});
export type Payout = z.infer<typeof payoutSchema>;

// ── Admin portal API ────────────────────────────────────────────────────────

export const adminRoleSchema = z.enum(['super_admin', 'agent']);
export type AdminRole = z.infer<typeof adminRoleSchema>;

/** GET /api/admin/me. Agents only see and manage the organizers they onboarded. */
export const adminMeSchema = z.object({
  role: adminRoleSchema,
  name: z.string().min(1),
  agentId: idSchema.nullable(),
});
export type AdminMe = z.infer<typeof adminMeSchema>;

/** An amount per currency: KSh and SSP are never added together. */
export const moneyByCurrencySchema = z.array(
  z.object({ currency: currencySchema, amountMinor: moneySchema }),
);
export type MoneyByCurrency = z.infer<typeof moneyByCurrencySchema>;

export const OVERVIEW_RANGES = [7, 30, 90] as const;
export const overviewQuerySchema = z.object({
  days: z.coerce
    .number()
    .refine((d) => (OVERVIEW_RANGES as readonly number[]).includes(d))
    .default(30),
  city: citySchema.optional(),
  category: categorySchema.optional(),
  currency: currencySchema.default('KES'),
});
export type OverviewQuery = z.input<typeof overviewQuerySchema>;

/** GET /api/admin/overview: platform numbers for one currency, range and filter. */
export const adminOverviewSchema = z.object({
  currency: currencySchema,
  days: z.int().positive(),
  grossMinor: moneySchema,
  feesMinor: moneySchema,
  /** Oldest first, one entry per day in the range. */
  dailyGrossMinor: z.array(moneySchema),
  pendingPayouts: moneyByCurrencySchema,
  pendingPayoutCount: z.int().nonnegative(),
  liveEvents: z.int().nonnegative(),
  activeOrganizers: z.int().nonnegative(),
  organizerCount: z.int().nonnegative(),
  avgRateBps: rateBpsSchema,
  topOrganizers: z.array(
    z.object({ handle: z.string(), name: z.string(), feesMinor: moneySchema }),
  ),
  /** M-Pesa across all markets for the range. */
  payments: z.object({
    attempts: z.int().nonnegative(),
    succeeded: z.int().nonnegative(),
    failures: z.array(z.object({ reason: paymentFailureSchema, count: z.int().nonnegative() })),
  }),
});
export type AdminOverview = z.infer<typeof adminOverviewSchema>;

export const adminOrganizerRowSchema = z.object({
  id: idSchema,
  handle: z.string(),
  name: z.string(),
  category: categorySchema,
  city: citySchema,
  currency: currencySchema,
  agent: agentSchema.nullable(),
  rateBps: rateBpsSchema,
  salesMinor: moneySchema,
  status: organizerStatusSchema,
});
export type AdminOrganizerRow = z.infer<typeof adminOrganizerRowSchema>;

export const adminPayoutRowSchema = payoutSchema.extend({
  organizerName: z.string(),
  handle: z.string(),
  currency: currencySchema,
  /** M-Pesa or bank transaction reference, recorded when marked paid. */
  reference: z.string().nullable(),
  paidAt: dateTimeSchema.nullable(),
});
export type AdminPayoutRow = z.infer<typeof adminPayoutRowSchema>;

/** GET /api/admin/applications: organizers waiting for approval, oldest first. Super Admin only. */
export const adminApplicationRowSchema = z.object({
  organizerId: idSchema,
  handle: z.string(),
  name: z.string(),
  type: z.string(),
  category: categorySchema,
  city: citySchema,
  agent: agentSchema.nullable(),
  contactName: z.string(),
  email: z.string(),
  about: z.string(),
  appliedAt: dateTimeSchema,
});
export type AdminApplicationRow = z.infer<typeof adminApplicationRowSchema>;

/** POST /api/admin/organizers/:handle/status. Super Admin only; allowed moves are in adminRules. */
export const organizerStatusChangeSchema = z.object({
  status: z.enum(['active', 'suspended', 'rejected']),
});
export type OrganizerStatusChange = z.infer<typeof organizerStatusChangeSchema>;

export const adminRateChangeSchema = rateChangeSchema.extend({ eventTitle: z.string().nullable() });

export const adminOrganizerDetailSchema = adminOrganizerRowSchema.extend({
  type: z.string(),
  payoutMethod: payoutMethodSchema,
  events: z.array(
    z.object({
      id: idSchema,
      title: z.string(),
      startsAt: dateTimeSchema,
      status: eventStatusSchema,
      /** Set when this event has its own rate. */
      rateBps: rateBpsSchema.nullable(),
    }),
  ),
  rateHistory: z.array(adminRateChangeSchema),
  pendingApproval: rateApprovalSchema.nullable(),
  payout: adminPayoutRowSchema.nullable(),
});
export type AdminOrganizerDetail = z.infer<typeof adminOrganizerDetailSchema>;

/** POST /api/admin/organizers/:handle/rate */
export const rateChangeRequestSchema = z.object({
  rateBps: z.int(),
  reason: z.string().trim(),
  /** Apply to one upcoming event only. */
  eventId: idSchema.nullable(),
});
export type RateChangeRequest = z.infer<typeof rateChangeRequestSchema>;

export const rateChangeResultSchema = z.object({
  outcome: z.enum(['applied', 'sent_for_approval']),
});

export const adminApprovalRowSchema = rateApprovalSchema.extend({
  organizerName: z.string(),
  handle: z.string(),
  agentName: z.string(),
  currentBps: rateBpsSchema,
  eventTitle: z.string().nullable(),
});
export type AdminApprovalRow = z.infer<typeof adminApprovalRowSchema>;

export const adminAgentRowSchema = agentSchema.extend({
  organizers: z.int().nonnegative(),
  sales: moneyByCurrencySchema,
  fees: moneyByCurrencySchema,
  avgRateBps: rateBpsSchema.nullable(),
});
export type AdminAgentRow = z.infer<typeof adminAgentRowSchema>;

export const markPaidRequestSchema = z.object({
  reference: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{6,30}$/, 'Enter the M-Pesa or bank reference (letters and numbers).'),
});

// ── Staff ───────────────────────────────────────────────────────────────────

/** GET /api/admin/staff: everyone who can open the admin portal. Super Admin only. */
export const staffRowSchema = z.object({
  id: idSchema,
  email: z.string(),
  name: z.string(),
  role: adminRoleSchema,
  /** Set for agents: what organizers are assigned to. */
  agentId: idSchema.nullable(),
  /** Whether they sign in with an authenticator app as well as the emailed code. */
  twoStep: z.boolean(),
  /** Organizers they look after (agents only). */
  organizers: z.int().nonnegative(),
});
export type StaffRow = z.infer<typeof staffRowSchema>;

/** POST /api/admin/staff: give someone access. They sign in with this email. */
export const addStaffRequestSchema = z.object({
  email: z
    .string()
    .transform((s) => s.trim().toLowerCase())
    .pipe(z.email('Enter a valid email address.')),
  name: z.string().trim().min(2, 'Enter their name.').max(80),
  role: adminRoleSchema,
});
export type AddStaffRequest = z.infer<typeof addStaffRequestSchema>;

/** POST /api/admin/organizers/:handle/agent: who looks after this organizer (null = nobody). */
export const assignAgentRequestSchema = z.object({ agentId: idSchema.nullable() });
