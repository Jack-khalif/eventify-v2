import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** outlined = 2px rule border (ticket aside, dashboard tiles); surface = tinted panel (totals). */
  variant?: 'outlined' | 'surface';
};

export function Card({ variant = 'outlined', className, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl',
        variant === 'outlined' ? 'border-2 border-rule bg-bg' : 'bg-surface',
        className,
      )}
      {...rest}
    />
  );
}
