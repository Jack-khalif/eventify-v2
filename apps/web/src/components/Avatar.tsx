import { initials } from '@eventify/shared';
import { cn } from '../lib/cn';

/** Organizer initials on the accent tint, as in the design (no uploaded logos yet). */
export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'flex flex-none items-center justify-center bg-accent-soft font-extrabold text-accent-text',
        className,
      )}
    >
      {initials(name)}
    </div>
  );
}
