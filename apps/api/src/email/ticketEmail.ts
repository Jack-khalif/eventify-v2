import {
  formatDate,
  formatMoney,
  formatTimeRange,
  type PublicEvent,
  type TicketView,
} from '@eventify/shared';
import QRCode from 'qrcode';
import {
  ACCENT,
  ACCENT_INK,
  emailShell,
  escapeHtml,
  FONT,
  INK,
  MONO,
  MUTED,
  SURFACE,
} from './layout';
import type { Email } from './mailer';

/** Same rule as the web app's "Get directions": the organizer's pin, else a search for the venue. */
const directionsUrl = (e: PublicEvent) =>
  e.mapUrl ??
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    [e.venue, e.address].filter(Boolean).join(', '),
  )}`;

const ticketLine = (t: TicketView) =>
  t.count > 1 ? `${t.tierName} · ${t.index} of ${t.count}` : t.tierName;

/**
 * The ticket email from the design's delivery screen: event, when and where, then each ticket's
 * code, backup QR and Live Pass link. One email covers every ticket in the order, or the one
 * ticket someone passed on.
 */
export async function ticketEmail(
  p: {
    /** Whoever the tickets are for. */
    buyer: { name: string; email: string };
    totalMinor: number;
    tickets: TicketView[];
    siteUrl: string;
  } & (
    | {
        orderId: string;
        /** Complimentary tickets the organizer sent, rather than ones the guest bought. */
        comp?: boolean;
      }
    | {
        /** A ticket passed on by its holder. Its new holder isn't told the order: that link is the buyer's. */
        transfer: {
          from: string;
          ticketId: string;
          /** Set when the holder asks for it to be sent again, so it isn't taken for a duplicate. */
          resendKey?: string;
        };
      }
  ),
): Promise<Email> {
  const event = p.tickets[0]!.event;
  const first = p.buyer.name.trim().split(/\s+/)[0]!;
  const when = `${formatDate(event.startsAt)} · ${formatTimeRange(event.startsAt, event.endsAt)}`;
  const many = p.tickets.length > 1;
  const passUrl = (t: TicketView) => `${p.siteUrl}/t/${t.id}`;
  const tickets = many ? 'tickets' : 'ticket';
  const words =
    'transfer' in p
      ? {
          lead: `Hi ${first}, ${p.transfer.from} has passed a ticket on to you. Show it at the door.`,
          opening: `Hi ${first}, ${p.transfer.from} has passed you a ticket for ${event.title}.`,
          subject: `${p.transfer.from} sent you a ticket for ${event.title}`,
          footer: `Transferred to you by ${p.transfer.from}`,
          key: `ticket-transfer/${p.transfer.ticketId}${p.transfer.resendKey ? `/${p.transfer.resendKey}` : ''}`,
        }
      : p.comp
        ? {
            lead: `Hi ${first}, ${event.organizer.name} has sent you ${many ? `${p.tickets.length} tickets` : 'a ticket'}. Show ${many ? 'them' : 'it'} at the door.`,
            opening: `Hi ${first}, ${event.organizer.name} has sent you ${many ? 'tickets' : 'a ticket'} for ${event.title}.`,
            subject: `${event.organizer.name} sent you ${many ? 'tickets' : 'a ticket'} for ${event.title}`,
            footer: `Complimentary ${tickets} from ${event.organizer.name} · Order ${p.orderId}`,
            key: `ticket-email/${p.orderId}`,
          }
        : {
            lead: `Hi ${first}, you’re confirmed. Show ${many ? 'these tickets' : 'this ticket'} at the door.`,
            opening: `Hi ${first}, you're confirmed for ${event.title}.`,
            subject: `Your ${tickets} for ${event.title}`,
            footer: `${p.totalMinor > 0 ? `Paid: ${formatMoney(event.currency, p.totalMinor)}` : 'Free ticket'} · Order ${p.orderId}`,
            key: `ticket-email/${p.orderId}`,
          };

  const inlineImages = await Promise.all(
    p.tickets.map(async (t, i) => ({
      contentId: `qr-${i + 1}`,
      filename: `${t.code}.png`,
      content: await QRCode.toBuffer(t.qrPayload, { type: 'png', width: 280, margin: 1 }),
    })),
  );

  const ticketBlocks = p.tickets
    .map(
      (t, i) => `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SURFACE};border-radius:12px;margin-top:12px">
          <tr>
            <td width="116" style="padding:12px"><img src="cid:qr-${i + 1}" width="92" height="92" alt="QR code for ${escapeHtml(t.code)}" style="display:block;border-radius:6px"></td>
            <td style="padding:12px 12px 12px 0;${FONT}">
              <div style="font-size:12px;color:${MUTED}">Ticket code</div>
              <div style="${MONO};font-size:15px;font-weight:800;color:${INK}">${escapeHtml(t.code)}</div>
              <div style="font-size:12px;color:${MUTED};padding-bottom:10px">${escapeHtml(ticketLine(t))}</div>
              <a href="${escapeHtml(passUrl(t))}" style="display:inline-block;background:${ACCENT};color:${ACCENT_INK};font-size:13px;font-weight:800;text-decoration:none;padding:9px 14px;border-radius:999px">Open Live Pass</a>
            </td>
          </tr>
        </table>`,
    )
    .join('');

  const html = emailShell({
    siteUrl: p.siteUrl,
    preview: `${words.lead} ${when} at ${event.venue}.`,
    content: `
          <div style="font-size:14px;color:${MUTED};padding-bottom:10px">${escapeHtml(words.lead)}</div>
          <div style="font-size:18px;font-weight:800;color:${INK};padding-bottom:8px">${escapeHtml(event.title)}</div>
          <div style="font-size:13px;line-height:1.5;color:${MUTED}">
            ${escapeHtml(when)}<br>
            ${escapeHtml(event.venue)} — <a href="${escapeHtml(directionsUrl(event))}" style="color:${MUTED}">view map</a>
          </div>
          ${ticketBlocks}
          <div style="font-size:12px;line-height:1.5;color:${MUTED};padding-top:14px">
            ${escapeHtml(words.footer)}<br>
            The Live Pass link is your ticket, so only share it with whoever is using it.
          </div>`,
  });

  const text = [
    words.opening,
    '',
    when,
    `${event.venue} (map: ${directionsUrl(event)})`,
    '',
    ...p.tickets.flatMap((t) => [`${t.code} · ${ticketLine(t)}`, `Live Pass: ${passUrl(t)}`, '']),
    words.footer,
    'The Live Pass link is your ticket, so only share it with whoever is using it.',
  ].join('\n');

  return {
    to: p.buyer.email,
    subject: words.subject,
    html,
    text,
    inlineImages,
    idempotencyKey: words.key,
  };
}
