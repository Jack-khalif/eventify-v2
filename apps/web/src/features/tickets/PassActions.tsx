import { formatDate, type PublicEvent } from '@eventify/shared';
import { useEffect, useState } from 'react';
import { buttonClass } from '../../components/ui';
import { siteUrl } from '../../lib/site';
import { downloadCalendarFile, googleCalendarLink, outlookCalendarLink } from '../event/calendar';

/**
 * "Add to calendar" and "Share that you're going" under the pass. Sharing always uses the public
 * event link: the /t/ link is the ticket itself and must not be posted.
 */
export function PassActions({ event }: { event: PublicEvent }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const share = async () => {
    const url = siteUrl(`/e/${event.slug}`);
    const text = `I'm going to ${event.title} on ${formatDate(event.startsAt)}. Join me!`;
    if (navigator.share) {
      try {
        await navigator.share({ title: event.title, text, url });
        return;
      } catch {
        // Dismissed or unsupported; fall back to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
    } catch {
      // Clipboard blocked; nothing else to do.
    }
  };

  return (
    <div className="flex w-full max-w-[360px] flex-col items-center gap-2">
      <div className="flex w-full flex-wrap gap-2.5">
        <a
          href={googleCalendarLink(event)}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass({
            variant: 'outline',
            size: 'md',
            className: 'flex-1 justify-center text-fg',
          })}
        >
          Add to calendar
        </a>
        <button
          type="button"
          onClick={share}
          className={buttonClass({
            size: 'md',
            className: 'flex-1 justify-center text-accent-ink hover:text-accent-ink',
          })}
        >
          {copied ? 'Link copied' : "Share that you're going"}
        </button>
      </div>
      <span className="text-xs text-muted">
        Calendar: or{' '}
        <a href={outlookCalendarLink(event)} target="_blank" rel="noopener noreferrer">
          Outlook
        </a>{' '}
        ·{' '}
        <button
          type="button"
          onClick={() => downloadCalendarFile(event)}
          className="cursor-pointer text-accent-text underline underline-offset-3 hover:text-fg"
        >
          Apple / other
        </button>
      </span>
    </div>
  );
}
