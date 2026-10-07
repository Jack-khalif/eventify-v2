import {
  accounts as sampleAccounts,
  events as sampleEvents,
  organizers as sampleOrganizers,
} from '@eventify/shared/fixtures';
import type { Db } from './client';
import { accounts, events, organizers, tiers } from './schema';

/** Load the design's sample organizers, sign-ins and events into an empty database. Does nothing otherwise. */
export async function seedSamples(db: Db): Promise<boolean> {
  const [existing] = await db.select({ id: organizers.id }).from(organizers).limit(1);
  if (existing) return false;

  await db.transaction(async (tx) => {
    await tx.insert(organizers).values(sampleOrganizers);
    await tx.insert(accounts).values(sampleAccounts);
    for (const { tiers: tierList, startsAt, endsAt, ...e } of sampleEvents) {
      await tx
        .insert(events)
        .values({ ...e, startsAt: new Date(startsAt), endsAt: new Date(endsAt) });
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
  });
  return true;
}
