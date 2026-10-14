import {
  MERCH_ITEM_LABEL,
  MERCH_STATUS_LABEL,
  SUPPORT_EMAIL,
  toEatIso,
  type AdminMerchRow,
  type MerchLine,
  type MerchRequest,
  type MerchRequestRow,
  type MerchStatus,
  type MerchStatusChange,
} from '@eventify/shared';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import type { Db } from './db/client';
import { events, merchRequests, organizers } from './db/schema';
import { escapeHtml, emailShell } from './email/layout';
import type { Mailer } from './email/mailer';
import type { OrganizerRow } from './organizer';

type MerchRow = typeof merchRequests.$inferSelect;
type AdminError = { status: 404; error: string; message: string };

const eatIso = (d: Date) => toEatIso(d.getTime());

const merchLines = (items: MerchLine[]) =>
  items.map((l) => `${l.quantity.toLocaleString('en-US')} × ${MERCH_ITEM_LABEL[l.item]}`);
const merchSummary = (items: MerchLine[]) => merchLines(items).join(', ');

const toRow = (r: MerchRow): MerchRequestRow => ({
  id: r.id,
  items: r.items,
  brandingNotes: r.brandingNotes,
  status: r.status,
  opsNote: r.opsNote,
  createdAt: eatIso(r.createdAt),
  updatedAt: eatIso(r.updatedAt),
});

const ownEvent = async (db: Db, o: OrganizerRow, eventId: string) =>
  (
    await db
      .select({ id: events.id, title: events.title })
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.organizerId, o.id)))
  )[0];

/** This organizer's merch requests for one of their events, newest first. */
export async function merchFor(db: Db, o: OrganizerRow, eventId: string) {
  if (!(await ownEvent(db, o, eventId))) return undefined;
  const rows = await db
    .select()
    .from(merchRequests)
    .where(eq(merchRequests.eventId, eventId))
    .orderBy(desc(merchRequests.createdAt));
  return rows.map(toRow);
}

/**
 * Put a request in the print queue, and tell the team so it doesn't wait for someone to look.
 * Undefined when the event isn't this organizer's. The note to the team never fails the request.
 */
export async function requestMerch(
  deps: { db: Db; mailer: Mailer; siteUrl: string; now: () => number },
  o: OrganizerRow,
  requestedByEmail: string,
  eventId: string,
  req: MerchRequest,
): Promise<MerchRequestRow[] | undefined> {
  const { db, now } = deps;
  const event = await ownEvent(db, o, eventId);
  if (!event) return undefined;
  const at = new Date(now());
  await db.insert(merchRequests).values({
    id: `mer_${randomBytes(6).toString('hex')}`,
    organizerId: o.id,
    eventId,
    items: req.items,
    brandingNotes: req.brandingNotes,
    requestedByEmail,
    status: 'received',
    createdAt: at,
    updatedAt: at,
  });

  const lines = merchLines(req.items);
  try {
    await deps.mailer({
      to: SUPPORT_EMAIL,
      subject: `Merch request: ${o.name} · ${event.title}`,
      text: [
        `${o.name} (${requestedByEmail}) asked for print for ${event.title}:`,
        '',
        ...lines,
        '',
        req.brandingNotes,
        '',
        `Print queue: ${deps.siteUrl}/admin/merch`,
      ].join('\n'),
      html: emailShell({
        siteUrl: deps.siteUrl,
        preview: `${o.name} asked for print for ${event.title}.`,
        content: `
          <p style="margin:0 0 10px">${escapeHtml(o.name)} (${escapeHtml(requestedByEmail)}) asked for print for <strong>${escapeHtml(event.title)}</strong>:</p>
          <p style="margin:0 0 10px">${lines.map(escapeHtml).join('<br>')}</p>
          <p style="margin:0 0 14px;white-space:pre-wrap">${escapeHtml(req.brandingNotes)}</p>
          <a href="${escapeHtml(`${deps.siteUrl}/admin/merch`)}">Open the print queue</a>`,
      }),
    });
  } catch (error) {
    console.error(`Telling the team about a merch request from ${o.handle} failed`, error);
  }
  return (await merchFor(db, o, eventId))!;
}

const adminRows = (db: Db) =>
  db
    .select({ request: merchRequests, organizer: organizers, event: events })
    .from(merchRequests)
    .innerJoin(organizers, eq(merchRequests.organizerId, organizers.id))
    .innerJoin(events, eq(merchRequests.eventId, events.id));

const toAdminRow = ({
  request,
  organizer,
  event,
}: {
  request: MerchRow;
  organizer: OrganizerRow;
  event: typeof events.$inferSelect;
}): AdminMerchRow => ({
  ...toRow(request),
  organizer: { name: organizer.name, handle: organizer.handle, email: request.requestedByEmail },
  event: { id: event.id, title: event.title, startsAt: eatIso(event.startsAt) },
});

/**
 * The print queue: open requests first, soonest event first among them, then finished and
 * cancelled ones, most recent first.
 */
export async function merchQueue(db: Db): Promise<AdminMerchRow[]> {
  const rows = await adminRows(db).orderBy(
    sql`${merchRequests.status} in ('delivered', 'cancelled')`,
    sql`case when ${merchRequests.status} in ('delivered', 'cancelled') then null else ${events.startsAt} end`,
    desc(merchRequests.updatedAt),
    asc(merchRequests.createdAt),
  );
  return rows.map(toAdminRow);
}

/**
 * Move a request along the queue. The note, if any, replaces what the organizer last saw. Whoever
 * asked for the merch is emailed when the status or the note changes; that never fails the change.
 */
export async function setMerchStatus(
  deps: { db: Db; mailer: Mailer; siteUrl: string; now: () => number },
  id: string,
  change: MerchStatusChange,
): Promise<AdminMerchRow | AdminError> {
  const { db, now } = deps;
  const [before] = await db.select().from(merchRequests).where(eq(merchRequests.id, id));
  if (!before) return { status: 404, error: 'not_found', message: 'Not found' };
  await db
    .update(merchRequests)
    .set({
      status: change.status,
      ...(change.note && { opsNote: change.note }),
      updatedAt: new Date(now()),
    })
    .where(eq(merchRequests.id, id));
  const [row] = await adminRows(db).where(eq(merchRequests.id, id));
  const updated = toAdminRow(row!);
  if (updated.status !== before.status || updated.opsNote !== before.opsNote) {
    await tellOrganizer(deps, updated, updated.status !== before.status);
  }
  return updated;
}

const STATUS_LINE: Record<MerchStatus, string> = {
  received: 'We have your request and will be in touch about artwork and a quote.',
  in_production: 'It’s being printed.',
  ready: 'It’s ready for you to collect.',
  delivered: 'It’s been handed over. Enjoy the event!',
  cancelled: 'It has been cancelled.',
};

/** "Your merch for Sauti Sessions is in production", with the team's note and a dashboard link. */
async function tellOrganizer(
  deps: { mailer: Mailer; siteUrl: string },
  r: AdminMerchRow,
  statusChanged: boolean,
) {
  const status = MERCH_STATUS_LABEL[r.status];
  const what = merchSummary(r.items);
  const link = `${deps.siteUrl}/organizer?event=${encodeURIComponent(r.event.id)}`;
  const lead = statusChanged
    ? `Your merch request for ${r.event.title} is now: ${status}. ${STATUS_LINE[r.status]}`
    : `There’s an update on your merch request for ${r.event.title}.`;
  try {
    await deps.mailer({
      to: r.organizer.email,
      subject: statusChanged
        ? `Merch for ${r.event.title}: ${status}`
        : `Merch for ${r.event.title}: a note from Eventify`,
      text: [
        lead,
        '',
        what,
        ...(r.opsNote ? ['', `From Eventify: ${r.opsNote}`] : []),
        '',
        `See it on your dashboard: ${link}`,
      ].join('\n'),
      html: emailShell({
        siteUrl: deps.siteUrl,
        preview: lead,
        content: `
          <p style="margin:0 0 10px">${escapeHtml(lead)}</p>
          <p style="margin:0 0 10px;font-weight:700">${escapeHtml(what)}</p>
          ${r.opsNote ? `<p style="margin:0 0 14px;white-space:pre-wrap"><strong>From Eventify:</strong> ${escapeHtml(r.opsNote)}</p>` : ''}
          <a href="${escapeHtml(link)}">See it on your dashboard</a>`,
      }),
    });
  } catch (error) {
    console.error(`Telling ${r.organizer.handle} about merch request ${r.id} failed`, error);
  }
}
