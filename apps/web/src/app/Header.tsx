import { Moon, Sun } from 'lucide-react';
import { Link, NavLink } from 'react-router';
import { buttonClass } from '../components/ui';
import { cn } from '../lib/cn';
import { useTheme } from './theme';

const navItems = [
  { to: '/', label: 'Discover', end: true },
  { to: '/organizer', label: 'For organizers', end: false },
  { to: '/account', label: 'Profile', end: false },
];

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <header className="sticky top-0 z-40 border-b-2 border-rule bg-bg">
      <div className="mx-auto flex max-w-[1240px] items-center gap-5 px-5 py-3.5">
        <Link
          to="/"
          className="mr-auto flex items-center gap-2.5 text-fg no-underline hover:text-fg"
        >
          <img src="/eventify-mark.png" alt="" width={40} height={21} />
          <span className="text-[15px] font-extrabold tracking-[0.22em]">EVENTIFY</span>
        </Link>

        <nav aria-label="Main" className="hidden gap-6 text-sm font-semibold md:flex">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn('no-underline hover:text-accent-text', isActive ? 'text-fg' : 'text-muted')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <Link
          to="/organizer/events/new"
          className={buttonClass({
            variant: 'outline',
            size: 'sm',
            className: 'hidden text-fg md:inline-flex',
          })}
        >
          Create event
        </Link>

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          className={buttonClass({ variant: 'ghost', size: 'icon' })}
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  );
}
