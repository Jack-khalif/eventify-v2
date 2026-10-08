import {
  accounts as sampleAccounts,
  agents as sampleAgents,
  events as sampleEvents,
  organizerApplications as sampleApplications,
  organizers as sampleOrganizers,
  rateApprovals as sampleApprovals,
  rateChanges as sampleRateChanges,
} from '@eventify/shared/fixtures';
import type { Db } from './client';
import {
  accounts,
  agents,
  events,
  organizerApplications,
  organizers,
  rateApprovals,
  rateChanges,
  tiers,
} from './schema';

/**
 * Door links for the sample events, the same ones the web app's mock API uses ("sauti-a92f" is the
 * one in the design). Guessable, which is fine for samples; real events get a random code.
 */
export function sampleCheckinCode(event: { id: string; slug: string }): string {
  if (event.id === 'evt_sauti') return 'sauti-a92f';
  let h = 0;
  for (const c of event.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `${event.slug.split('-')[0]!.slice(0, 12)}-${h.toString(16).padStart(4, '0').slice(-4)}`;
}

/** Load the design's sample organizers, sign-ins and events into an empty database. Does nothing otherwise. */
export async function seedSamples(db: Db): Promise<boolean> {
  const [existing] = await db.select({ id: organizers.id }).from(organizers).limit(1);
  if (existing) return false;

  await db.transaction(async (tx) => {
    await tx.insert(agents).values(sampleAgents);
    await tx.insert(organizers).values(sampleOrganizers);
    await tx.insert(accounts).values(sampleAccounts);
    await tx
      .insert(organizerApplications)
      .values(sampleApplications.map((a) => ({ ...a, appliedAt: new Date(a.appliedAt) })));
    for (const { tiers: tierList, startsAt, endsAt, ...e } of sampleEvents) {
      await tx.insert(events).values({
        ...e,
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        checkinCode: sampleCheckinCode(e),
      });
      await tx.insert(tiers).values(
        tierList.map((t, i) => ({
          ...t,
          eventId: e.id,
          position: i + 1,
          saleStartsAt: t.saleStartsAt ? new Date(t.saleStartsAt) : null,
          saleEndsAt: t.saleEndsAt ? new Date(t.saleEndsAt) : null,
        })),
      );
    }
    await tx
      .insert(rateChanges)
      .values(sampleRateChanges.map((c) => ({ ...c, at: new Date(c.at) })));
    await tx
      .insert(rateApprovals)
      .values(sampleApprovals.map((a) => ({ ...a, requestedAt: new Date(a.requestedAt) })));
  });
  return true;
}
