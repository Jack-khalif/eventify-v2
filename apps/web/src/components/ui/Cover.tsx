import type { CoverTone } from '@eventify/shared';
import type { ReactNode } from 'react';
import { imageSrc } from '../../lib/api';
import { cn } from '../../lib/cn';

const toneBg: Record<CoverTone, string> = {
  music: 'var(--ev-cover-music)',
  campus: 'var(--ev-cover-campus)',
  corporate: 'var(--ev-cover-corporate)',
  workshop: 'var(--ev-cover-workshop)',
};

type CoverProps = {
  tone: CoverTone;
  imageUrl?: string | null;
  alt?: string;
  className?: string;
  /** Overlays such as the date badge. */
  children?: ReactNode;
};

/**
 * Event cover. With a poster, the whole poster is shown (never cropped) over a blurred copy of
 * itself, so portrait flyers, square and landscape artwork all fit any card shape.
 * Without one, the design's striped placeholder for the category is used.
 */
export function Cover({ tone, imageUrl, alt = '', className, children }: CoverProps) {
  return (
    <div
      className={cn('relative overflow-hidden rounded-2xl', className)}
      style={{ background: toneBg[tone] }}
      data-tone={tone}
    >
      {imageUrl && (
        <>
          <img
            src={imageSrc(imageUrl)}
            alt=""
            aria-hidden
            loading="lazy"
            className="absolute inset-0 size-full scale-125 object-cover opacity-70 blur-2xl"
          />
          <img
            src={imageSrc(imageUrl)}
            alt={alt}
            loading="lazy"
            className="absolute inset-0 size-full object-contain"
          />
        </>
      )}
      {children}
    </div>
  );
}
