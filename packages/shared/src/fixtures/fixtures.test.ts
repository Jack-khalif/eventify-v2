import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  accountSchema,
  agentSchema,
  doorSchema,
  eventSchema,
  guestSchema,
  organizerApplicationSchema,
  organizerDashboardSchema,
  organizerProfileSchema,
  organizerSchema,
  payoutSchema,
  priceLabel,
  rateApprovalSchema,
  rateChangeSchema,
} from '../schemas';
import * as f from './index';

describe('fixtures match the shared schemas', () => {
  it.each([
    ['organizers', z.array(organizerSchema), f.organizers],
    ['organizerProfiles', z.array(organizerProfileSchema), f.organizerProfiles],
    ['events', z.array(eventSchema), f.events],
    ['doors', z.array(doorSchema), f.doors],
    ['guests', z.array(guestSchema), f.guests],
    ['sautiDashboard', organizerDashboardSchema, f.sautiDashboard],
    ['agents', z.array(agentSchema), f.agents],
    ['rateChanges', z.array(rateChangeSchema), f.rateChanges],
    ['rateApprovals', z.array(rateApprovalSchema), f.rateApprovals],
    ['payouts', z.array(payoutSchema), f.payouts],
    ['accounts', z.array(accountSchema), f.accounts],
    ['organizerApplications', z.array(organizerApplicationSchema), f.organizerApplications],
  ] as const)('%s', (_name, schema, data) => {
    expect(schema.safeParse(data).error).toBeUndefined();
  });

  it('references only organizers and agents that exist', () => {
    const orgIds = new Set(f.organizers.map((o) => o.id));
    const agentIds = new Set(f.agents.map((a) => a.id));
    for (const e of f.events) expect(orgIds).toContain(e.organizerId);
    for (const o of f.organizers) if (o.agentId) expect(agentIds).toContain(o.agentId);
    for (const a of f.accounts) {
      if (a.organizerId) expect(orgIds).toContain(a.organizerId);
      if (a.agentId) expect(agentIds).toContain(a.agentId);
    }
    for (const a of f.organizerApplications) expect(orgIds).toContain(a.organizerId);
  });

  it('has unique slugs and handles', () => {
    expect(new Set(f.events.map((e) => e.slug)).size).toBe(f.events.length);
    expect(new Set(f.organizers.map((o) => o.handle)).size).toBe(f.organizers.length);
  });

  it('produces the price labels shown in the design', () => {
    const bySlug = (s: string) => f.events.find((e) => e.slug === s)!;
    expect(priceLabel(bySlug('sauti-sessions'))).toBe('From KSh 600');
    expect(priceLabel(bySlug('ieee-hackathon'))).toBe('Free');
    expect(priceLabel(bySlug('pwani-taarab'))).toBe('KSh 1,500');
    expect(priceLabel(bySlug('juba-tech-summit'))).toBe('From SSP 15,000');
  });
});
