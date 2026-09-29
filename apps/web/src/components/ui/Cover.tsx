import type { CoverTone } from '@eventify/shared';
import type { ReactNode } from 'react';
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

/** Event cover: the uploaded poster, or the design's striped placeholder for that category. */
export function Cover({ tone, imageUrl, alt = '', className, children }: CoverProps) {
  return (
    <div
      className={cn('relative overflow-hidden rounded-2xl', className)}
      style={{ background: toneBg[tone] }}
      data-tone={tone}
    >
      {imageUrl && (
        <img src={imageUrl} alt={alt} className="absolute inset-0 size-full object-cover" />
      )}
      {children}
    </div>
  );
}
