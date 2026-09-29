import { formatDate } from './dates';

/**
 * Ticket confirmation SMS, worded as in the design. Used for the preview screen now and sent
 * by the backend in Phase D.
 */
export function ticketSms(p: {
  name: string;
  eventTitle: string;
  startsAt: string;
  code: string;
  passUrl: string;
}): string {
  const first = p.name.trim().split(/\s+/)[0];
  return `Hi ${first}, you're confirmed for ${p.eventTitle} on ${formatDate(p.startsAt)}. Ticket code ${p.code}. View your Live Pass: ${p.passUrl}`;
}

// GSM-7 basic set: messages using only these cost 160 characters per SMS (153 when split).
const GSM7 =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXTENDED = '^{}\\[~]|€'; // count as two characters

/** How many SMS parts a message is billed as. Any character outside GSM-7 (e.g. emoji, ’) drops the limit to 70. */
export function smsSegments(text: string): {
  encoding: 'GSM-7' | 'UCS-2';
  length: number;
  segments: number;
} {
  let length = 0;
  for (const ch of text) {
    if (GSM7.includes(ch)) length += 1;
    else if (GSM7_EXTENDED.includes(ch)) length += 2;
    else {
      const units = [...text].length;
      return {
        encoding: 'UCS-2',
        length: units,
        segments: units <= 70 ? 1 : Math.ceil(units / 67),
      };
    }
  }
  return { encoding: 'GSM-7', length, segments: length <= 160 ? 1 : Math.ceil(length / 153) };
}
