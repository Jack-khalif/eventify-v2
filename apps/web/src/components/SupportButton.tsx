import { SUPPORT_EMAIL } from '@eventify/shared';
import { LifeBuoy } from 'lucide-react';

/**
 * The floating way to reach us, for buyers and organizers alike: it opens an email to support.
 * On phones it sits above the tab bar and the buy bar, which own the bottom edge.
 */
export function SupportButton() {
  return (
    <a
      href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Help with Eventify')}`}
      aria-label={`Email support at ${SUPPORT_EMAIL}`}
      title={`Email ${SUPPORT_EMAIL}`}
      className="fixed right-4 bottom-[calc(88px+env(safe-area-inset-bottom))] z-30 flex h-12 min-w-12 items-center justify-center gap-2 rounded-full bg-accent px-3.5 text-sm font-extrabold text-accent-ink no-underline hover:bg-accent-hover hover:text-accent-ink md:right-5 md:bottom-5 md:px-4"
    >
      <LifeBuoy size={20} aria-hidden />
      <span className="hidden md:inline">Support</span>
    </a>
  );
}
