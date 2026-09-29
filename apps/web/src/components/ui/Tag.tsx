import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export type TagTone = 'accent' | 'danger' | 'good' | 'neutral' | 'outline';

const tones: Record<TagTone, string> = {
  accent: 'bg-accent-soft text-accent-text',
  danger: 'bg-danger-soft text-danger',
  good: 'bg-good-soft text-good',
  neutral: 'bg-surface-2 text-muted',
  outline: 'border border-hair text-muted font-semibold',
};

type TagProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: TagTone;
  /** pill = status badges ("SOLD OUT", "Live"); square = payment badges ("M-PESA"). */
  shape?: 'pill' | 'square';
};

export function Tag({ tone = 'accent', shape = 'pill', className, ...rest }: TagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center text-[11px] leading-none font-extrabold whitespace-nowrap',
        shape === 'pill' ? 'rounded-full px-2 py-1' : 'rounded-sm px-2 py-1',
        tones[tone],
        className,
      )}
      {...rest}
    />
  );
}
