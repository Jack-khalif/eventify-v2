import { formatMoney, SUPPORT_EMAIL, type Currency } from '@eventify/shared';
import type { RefundReason } from '../db/schema';
import { emailShell, escapeHtml, INK, MUTED } from './layout';
import type { Email } from './mailer';

const WHY: Record<RefundReason, string> = {
  late: 'Your payment reached us after your order had closed, and the tickets had gone by then.',
  duplicate:
    'You paid twice for the same order. Your tickets are safe; this was the extra payment.',
  amount_mismatch:
    "The amount we received didn't match your order, so we couldn't issue tickets for it.",
};

/** Tells the buyer we're sending money back, and why. */
export function refundEmail(p: {
  buyer: { name: string; email: string };
  attemptId: string;
  eventTitle: string;
  amountMinor: number;
  currency: Currency;
  reason: RefundReason;
  siteUrl: string;
}): Email {
  const amount = formatMoney(p.currency, p.amountMinor);
  const first = p.buyer.name.split(' ')[0] || p.buyer.name;
  const lines = [
    `Hi ${first},`,
    `We're refunding ${amount} for ${p.eventTitle}. ${WHY[p.reason]}`,
    'M-Pesa refunds usually arrive within a day; card refunds can take up to 10 working days to show on your statement.',
    `Questions? Reply to this email or write to ${SUPPORT_EMAIL}.`,
  ];
  const content = lines
    .map(
      (line, i) =>
        `<p style="margin:0 0 12px;font-size:${i === 1 ? 16 : 14}px;line-height:1.5;color:${i === 1 ? INK : MUTED}">${escapeHtml(line)}</p>`,
    )
    .join('');
  return {
    to: p.buyer.email,
    subject: `Refund of ${amount} for ${p.eventTitle}`,
    text: lines.join('\n\n'),
    html: emailShell({ siteUrl: p.siteUrl, preview: `We're refunding ${amount}.`, content }),
    idempotencyKey: `refund-email/${p.attemptId}`,
  };
}
