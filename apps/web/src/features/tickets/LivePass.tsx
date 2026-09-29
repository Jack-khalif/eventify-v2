import { formatTime, passHue, type TicketView } from '@eventify/shared';
import { CircleCheck } from 'lucide-react';
import { QrCode } from '../../components/QrCode';
import { ticketLine } from './ticketLine';
import { useLiveCode } from './useLiveCode';

/** The design's conic gradient, in today's colours. */
function passBackground(now = new Date()) {
  const hue = passHue(now);
  return `conic-gradient(from 200deg, hsl(${hue},62%,42%), hsl(${(hue + 55) % 360},70%,52%), hsl(${hue},62%,42%))`;
}

/**
 * Express Entry Live Pass: a rotating code the door checks offline, over colours that change
 * daily, with the signed backup QR underneath.
 */
export function LivePass({ ticket }: { ticket: TicketView }) {
  const { code, progress } = useLiveCode(ticket.passSecret);
  const checkedIn = ticket.checkedInAt !== null;

  return (
    <article
      aria-label={`Live Pass for ${ticket.event.title}`}
      className="w-full max-w-[360px] overflow-hidden rounded-[22px] shadow-[0_12px_30px_rgba(0,0,0,0.18)]"
    >
      <div className="flex items-center gap-2 bg-accent-ink px-[18px] py-4">
        <img src="/eventify-mark.png" alt="" className="h-3.5 w-[26px]" />
        <span className="text-xs font-extrabold tracking-[0.16em] text-white">
          EXPRESS ENTRY · LIVE PASS
        </span>
      </div>

      <div
        className="flex flex-col items-center gap-3.5 px-5 py-[22px] text-white"
        style={{ background: passBackground() }}
      >
        <span className="text-center text-xs font-bold tracking-[0.1em] uppercase opacity-85">
          {ticket.event.title}
        </span>
        {checkedIn ? (
          <div className="flex flex-col items-center gap-1.5 py-2">
            <CircleCheck size={44} aria-hidden />
            <span className="text-2xl font-extrabold">Checked in</span>
            <span className="text-xs opacity-85">at {formatTime(ticket.checkedInAt!)}</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <span
              data-testid="live-code"
              aria-label="Live code"
              className="min-h-[53px] font-mono text-[44px] font-extrabold tracking-[0.08em]"
            >
              {code ?? '······'}
            </span>
            <div className="h-1 w-32 overflow-hidden rounded-full bg-white/25" aria-hidden>
              <div
                className="h-full rounded-full bg-white/85"
                style={{ width: `${Math.round((1 - progress) * 100)}%` }}
              />
            </div>
            <span className="mt-1 text-[11px] opacity-85">
              refreshes every few seconds — screenshots won't work
            </span>
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-2.5 text-xs font-bold">
          <span>{ticket.holderName}</span>
          <span className="opacity-60">·</span>
          <span>{ticketLine(ticket)}</span>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 bg-bg p-5 text-fg">
        <div className="flex justify-center rounded-[14px] bg-surface p-3">
          <QrCode value={ticket.qrPayload} size={140} label={`Backup QR for ${ticket.code}`} />
        </div>
        <span className="text-[11px] text-muted">
          Backup QR — use if the code above can't be shown
        </span>
        <div className="flex w-full justify-between gap-3 font-mono text-xs text-muted">
          <span>{ticket.code}</span>
          <span className="truncate">{ticket.event.venue}</span>
        </div>
      </div>
    </article>
  );
}
