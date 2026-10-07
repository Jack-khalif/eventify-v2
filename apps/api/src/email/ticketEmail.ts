import {
  formatDate,
  formatMoney,
  formatTimeRange,
  type PublicEvent,
  type TicketView,
} from '@eventify/shared';
import QRCode from 'qrcode';
import type { Email } from './mailer';

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Same rule as the web app's "Get directions": the organizer's pin, else a search for the venue. */
const directionsUrl = (e: PublicEvent) =>
  e.mapUrl ??
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    [e.venue, e.address].filter(Boolean).join(', '),
  )}`;

const ticketLine = (t: TicketView) =>
  t.count > 1 ? `${t.tierName} · ${t.index} of ${t.count}` : t.tierName;

// Colours from apps/web/src/styles/tokens.css (light theme); email clients need them inline.
const INK = '#0e1a1c';
const MUTED = '#56666a';
const SURFACE = '#f1f6f6';
const ACCENT = '#5ce1e6';
const ACCENT_INK = '#06292b';
const FONT = "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * The ticket email from the design's delivery screen: event, when and where, then each ticket's
 * code, backup QR and Live Pass link. One email covers every ticket in the order.
 */
export async function ticketEmail(p: {
  buyer: { name: string; email: string };
  orderId: string;
  totalMinor: number;
  tickets: TicketView[];
  siteUrl: string;
}): Promise<Email> {
  const event = p.tickets[0]!.event;
  const first = p.buyer.name.trim().split(/\s+/)[0]!;
  const when = `${formatDate(event.startsAt)} · ${formatTimeRange(event.startsAt, event.endsAt)}`;
  const many = p.tickets.length > 1;
  const passUrl = (t: TicketView) => `${p.siteUrl}/t/${t.id}`;
  const paid =
    p.totalMinor > 0 ? `Paid: ${formatMoney(event.currency, p.totalMinor)}` : 'Free ticket';

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
              <div style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:15px;font-weight:800;color:${INK}">${escapeHtml(t.code)}</div>
              <div style="font-size:12px;color:${MUTED};padding-bottom:10px">${escapeHtml(ticketLine(t))}</div>
              <a href="${escapeHtml(passUrl(t))}" style="display:inline-block;background:${ACCENT};color:${ACCENT_INK};font-size:13px;font-weight:800;text-decoration:none;padding:9px 14px;border-radius:999px">Open Live Pass</a>
            </td>
          </tr>
        </table>`,
    )
    .join('');

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px 12px;background:${SURFACE}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border:2px solid ${INK};border-radius:16px;${FONT}">
      <tr>
        <td style="padding:12px 16px;border-bottom:2px solid ${INK};font-size:12px;font-weight:800;letter-spacing:0.14em;color:${INK}">EVENTIFY</td>
      </tr>
      <tr>
        <td style="padding:16px">
          <div style="font-size:14px;color:${MUTED};padding-bottom:10px">Hi ${escapeHtml(first)}, you’re confirmed. Show ${many ? 'these tickets' : 'this ticket'} at the door.</div>
          <div style="font-size:18px;font-weight:800;color:${INK};padding-bottom:8px">${escapeHtml(event.title)}</div>
          <div style="font-size:13px;line-height:1.5;color:${MUTED}">
            ${escapeHtml(when)}<br>
            ${escapeHtml(event.venue)} — <a href="${escapeHtml(directionsUrl(event))}" style="color:${MUTED}">view map</a>
          </div>
          ${ticketBlocks}
          <div style="font-size:12px;line-height:1.5;color:${MUTED};padding-top:14px">
            ${escapeHtml(paid)} · Order ${escapeHtml(p.orderId)}<br>
            The Live Pass link is your ticket, so only share it with whoever is using it.
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `Hi ${first}, you're confirmed for ${event.title}.`,
    '',
    when,
    `${event.venue} (map: ${directionsUrl(event)})`,
    '',
    ...p.tickets.flatMap((t) => [`${t.code} · ${ticketLine(t)}`, `Live Pass: ${passUrl(t)}`, '']),
    `${paid} · Order ${p.orderId}`,
    'The Live Pass link is your ticket, so only share it with whoever is using it.',
  ].join('\n');

  return {
    to: p.buyer.email,
    subject: `Your ${many ? 'tickets' : 'ticket'} for ${event.title}`,
    html,
    text,
    inlineImages,
    idempotencyKey: `ticket-email/${p.orderId}`,
  };
}
