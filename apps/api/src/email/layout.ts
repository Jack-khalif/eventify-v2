// Colours from apps/web/src/styles/tokens.css (light theme); email clients need them inline.
export const INK = '#0e1a1c';
export const MUTED = '#56666a';
export const SURFACE = '#f1f6f6';
export const ACCENT = '#5ce1e6';
export const ACCENT_INK = '#06292b';
export const FONT = "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
export const MONO = 'font-family:ui-monospace,Menlo,Consolas,monospace';

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * The card every Eventify email sits in: the logo on top, the message, then who sent it.
 * `preview` is the line inboxes show after the subject; it is hidden in the message itself.
 */
export function emailShell(p: { siteUrl: string; preview: string; content: string }): string {
  const site = escapeHtml(p.siteUrl);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light">
  </head>
  <body style="margin:0;padding:24px 12px;background:${SURFACE}">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(p.preview)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border:2px solid ${INK};border-radius:16px;${FONT}">
      <tr>
        <td style="padding:12px 16px;border-bottom:2px solid ${INK}">
          <a href="${site}" style="text-decoration:none;color:${INK}">
            <img src="${site}/eventify-mark.png" width="40" height="21" alt="" style="vertical-align:middle;border:0">
            <span style="vertical-align:middle;padding-left:6px;font-size:12px;font-weight:800;letter-spacing:0.14em;color:${INK}">EVENTIFY</span>
          </a>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 16px 16px">${p.content}</td>
      </tr>
    </table>
    <div style="max-width:480px;margin:0 auto;padding:14px 16px 0;font-size:12px;line-height:1.5;color:${MUTED};text-align:center;${FONT}">
      Sent by Eventify, tickets for events near you.<br>
      <a href="${site}" style="color:${MUTED}">${escapeHtml(p.siteUrl.replace(/^https?:\/\//, ''))}</a>
    </div>
  </body>
</html>`;
}
