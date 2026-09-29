import { formatDate, type PublicEvent } from '@eventify/shared';
import { Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Cover } from '../../components/ui';
import { displayUrl, siteUrl } from '../../lib/site';

const shareButton =
  'inline-flex cursor-pointer items-center rounded-md border-2 border-rule px-3.5 py-[9px] text-sm font-extrabold text-fg no-underline hover:bg-accent hover:text-accent-ink';

/** Short link with Copy, share targets and a preview of the link card, as in the design. */
export function ShareBlock({ event }: { event: PublicEvent }) {
  const url = siteUrl(`/e/${event.slug}`);
  const message = `${event.title} · ${formatDate(event.startsAt)} at ${event.venue}`;
  const [copied, setCopied] = useState<null | 'link' | 'instagram'>(null);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async (kind: 'link' | 'instagram') => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(kind);
    } catch {
      // Clipboard can be blocked; the link is visible to copy by hand.
    }
  };

  /** Instagram has no web share link: use the phone's share sheet, or copy for pasting into a story. */
  const shareToInstagram = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: event.title, text: message, url });
        return;
      } catch {
        // Dismissed or unsupported; fall back to copying.
      }
    }
    await copy('instagram');
  };

  const [host, path] = [displayUrl(url).replace(/\/e\/.*$/, ''), event.slug];

  return (
    <section
      aria-labelledby="share-heading"
      className="flex flex-col gap-3 border-t-2 border-rule pt-5"
    >
      <h2 id="share-heading" className="m-0 text-[22px]">
        Share
      </h2>
      <div className="flex max-w-[460px] items-center gap-2 rounded-lg border-2 border-hair py-1.5 pr-1.5 pl-3.5">
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold" data-testid="share-url">
          {host}/e/<span className="text-accent-text">{path}</span>
        </span>
        <button
          type="button"
          onClick={() => copy('link')}
          className="inline-flex flex-none cursor-pointer items-center gap-1.5 rounded-[8px] bg-fg px-3 py-2 text-sm font-extrabold text-bg hover:opacity-85"
        >
          <Copy size={15} aria-hidden />
          {copied === 'link' ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <a
          className={shareButton}
          href={`https://wa.me/?text=${encodeURIComponent(`${message}\n${url}`)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          WhatsApp
        </a>
        <button type="button" className={shareButton} onClick={shareToInstagram}>
          {copied === 'instagram' ? 'Link copied for your story' : 'Instagram'}
        </button>
        <a
          className={shareButton}
          href={`https://x.com/intent/post?text=${encodeURIComponent(message)}&url=${encodeURIComponent(url)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          X
        </a>
      </div>

      <figure className="m-0 mt-1 flex max-w-[340px] items-center gap-3 rounded-xl border-2 border-hair p-3.5">
        <Cover tone={event.coverTone} imageUrl={event.coverImageUrl} className="size-16 rounded-md">
          <img
            src="/eventify-mark.png"
            alt=""
            className="absolute right-[5px] bottom-[5px] h-[11px] w-5"
          />
        </Cover>
        <figcaption className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[13px] font-extrabold">{event.title}</span>
          <span className="text-xs text-muted">
            {formatDate(event.startsAt)} · {event.venue}
          </span>
          <span className="font-mono text-[11px] text-muted">Link preview</span>
        </figcaption>
      </figure>
    </section>
  );
}
