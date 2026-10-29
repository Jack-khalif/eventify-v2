import { formatTime, type TicketView } from '@eventify/shared';
import { CircleCheck } from 'lucide-react';
import { QrCode } from '../../components/QrCode';
import { ticketLine } from './ticketLine';

/**
 * Static ticket pass: its signed QR is verified by the downloaded guest list, even offline.
 */
export function TicketCard({ ticket }: { ticket: TicketView }) {
  const checkedIn = ticket.checkedInAt !== null;

  return (
    <article
      aria-label={`Ticket for ${ticket.event.title}`}
      className="w-full max-w-[360px] overflow-hidden rounded-[22px] shadow-[0_12px_30px_rgba(0,0,0,0.18)]"
    >
      <div className="flex items-center gap-2 bg-accent-ink px-[18px] py-4">
        <img src="/eventify-mark.png" alt="" className="h-3.5 w-[26px]" />
        <span className="text-xs font-extrabold tracking-[0.16em] text-white">EVENTIFY TICKET</span>
      </div>

      <div className="flex flex-col items-center gap-3.5 bg-accent-ink px-5 py-[22px] text-white">
        <span className="text-center text-lg font-extrabold">{ticket.event.title}</span>
        {checkedIn ? (
          <div className="flex flex-col items-center gap-1.5 py-2">
            <CircleCheck size={44} aria-hidden />
            <span className="text-2xl font-extrabold">Checked in</span>
            <span className="text-xs opacity-85">at {formatTime(ticket.checkedInAt!)}</span>
          </div>
        ) : (
          <span className="text-center text-sm">Show this QR code at the door</span>
        )}
        <div className="flex flex-wrap justify-center gap-2.5 text-xs font-bold">
          <span>{ticket.holderName}</span>
          <span className="opacity-60">·</span>
          <span>{ticketLine(ticket)}</span>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 bg-bg p-5 text-fg">
        <div className="flex justify-center rounded-[14px] bg-surface p-3">
          <QrCode value={ticket.qrPayload} size={180} label={`Ticket QR for ${ticket.code}`} />
        </div>
        <span className="text-[11px] text-muted">Ticket code: {ticket.code}</span>
        <div className="flex w-full justify-between gap-3 font-mono text-xs text-muted">
          <span>One entry</span>
          <span className="truncate">{ticket.event.venue}</span>
        </div>
      </div>
    </article>
  );
}
