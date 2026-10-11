import { CODE_LIFETIME_MS } from '../codes';
import { emailShell, escapeHtml, FONT, INK, MONO, MUTED, SURFACE } from './layout';
import type { Email } from './mailer';

const MINUTES = CODE_LIFETIME_MS / 60_000;

/**
 * An email whose whole point is a 6-digit code. The code leads the subject and the first line, so
 * it can be read (and, on most phones, copied) from the notification without opening the email.
 */
export function codeEmail(p: {
  to: string;
  siteUrl: string;
  code: string;
  /** What the code is, as in "Your Eventify sign-in code". */
  name: string;
  /** Where to type it. */
  instruction: string;
  /** What happens if they didn't ask for it. */
  ifNotYou: string;
}): Email {
  const lifetime = `It works for ${MINUTES} minutes and can be used once.`;
  const content = `
          <div style="font-size:20px;font-weight:800;color:${INK};padding-bottom:6px">Your ${escapeHtml(p.name)}</div>
          <div style="font-size:14px;line-height:1.5;color:${MUTED};padding-bottom:14px">${escapeHtml(p.instruction)}</div>
          <div style="background:${SURFACE};border-radius:12px;padding:16px 8px;text-align:center;${MONO};font-size:34px;font-weight:800;letter-spacing:0.18em;color:${INK}">${p.code}</div>
          <div style="font-size:13px;line-height:1.5;color:${MUTED};padding-top:14px;${FONT}">
            ${lifetime}<br>
            ${escapeHtml(p.ifNotYou)}
          </div>`;
  return {
    to: p.to,
    subject: `${p.code} is your Eventify ${p.name}`,
    html: emailShell({
      siteUrl: p.siteUrl,
      preview: `${p.code} is your Eventify ${p.name}. ${lifetime}`,
      content,
    }),
    text: [
      `${p.code} is your Eventify ${p.name}.`,
      '',
      p.instruction,
      lifetime,
      '',
      p.ifNotYou,
    ].join('\n'),
  };
}
