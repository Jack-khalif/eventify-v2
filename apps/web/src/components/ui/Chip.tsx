import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean };

/** Filter pill: category chips on Discover, tier presets in the create wizard. */
export function Chip({ active = false, className, type = 'button', ...rest }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={active}
      className={cn(
        'h-10 flex-none cursor-pointer rounded-full border-2 px-4 text-sm font-semibold transition-colors',
        active
          ? 'border-rule bg-fg text-bg'
          : 'border-hair bg-transparent text-fg hover:border-rule',
        className,
      )}
      {...rest}
    />
  );
}
