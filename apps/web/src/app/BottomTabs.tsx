import { Compass, Heart, Ticket, User, type LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router';
import { cn } from '../lib/cn';

const tabs: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Discover', icon: Compass, end: true },
  { to: '/tickets', label: 'Tickets', icon: Ticket },
  { to: '/saved', label: 'Saved', icon: Heart },
  { to: '/account', label: 'Profile', icon: User },
];

/** Mobile-only tab bar from the design. Hidden at md and up, where the header nav takes over. */
export function BottomTabs() {
  return (
    <nav
      aria-label="Tabs"
      className="sticky bottom-0 z-40 grid grid-cols-4 border-t-2 border-rule bg-bg px-2 pt-2 pb-[max(14px,env(safe-area-inset-bottom))] md:hidden"
    >
      {tabs.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'flex flex-col items-start gap-1 px-2.5 py-1.5 text-[11px] no-underline',
              isActive ? 'font-extrabold text-fg' : 'font-semibold text-muted',
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon size={22} strokeWidth={2} fill={isActive ? 'var(--ev-accent)' : 'none'} />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
