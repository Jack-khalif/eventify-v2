import { canCreateEvents } from '@eventify/shared';
import { Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { Avatar } from '../components/Avatar';
import { buttonClass } from '../components/ui';
import { loginPath } from '../features/auth/roles';
import { useSession } from '../features/auth/useSession';
import { cn } from '../lib/cn';
import { workLink } from './nav';
import { storedTheme, useTheme } from './theme';

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  // The toggle draws attention to itself until the visitor has picked a theme once.
  const [themePicked, setThemePicked] = useState(() => storedTheme() !== null);
  const { user, status } = useSession();
  const { pathname, search } = useLocation();
  const work = workLink(user);

  const navItems = [
    { to: '/discover', label: 'Discover', end: false },
    { to: '/tickets', label: 'Tickets', end: false },
    { ...work, end: false },
  ];
  const firstName = (user?.name || user?.organizer?.name || 'Account').split(' ')[0]!;
  // Hidden while the session loads, so signed-in people don't see "Sign in" flash by.
  const guest = !user && status !== 'loading';

  return (
    <header className="sticky top-0 z-40 border-b-2 border-rule bg-bg">
      <div className="mx-auto flex max-w-[1240px] items-center gap-2.5 px-5 py-3.5 sm:gap-5">
        <Link
          to="/"
          className="mr-auto flex items-center gap-2.5 text-fg no-underline hover:text-fg"
        >
          <img src="/eventify-mark.png" alt="" width={40} height={21} />
          {/* Small phones have no room for the name beside a guest's two buttons. */}
          <span
            className={cn(
              'text-[15px] font-extrabold tracking-[0.22em]',
              guest && 'hidden min-[440px]:inline',
            )}
          >
            EVENTIFY
          </span>
        </Link>

        <nav aria-label="Main" className="hidden gap-6 text-sm font-semibold md:flex">
          {navItems.map((item) => (
            <NavLink
              key={item.label}
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

        {canCreateEvents(user) && (
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
        )}

        {user ? (
          <Link
            to="/account"
            aria-label={`Profile: ${user.name || 'your account'}`}
            className="hidden items-center gap-2 rounded-full border-2 border-rule py-1 pr-3 pl-1 text-sm font-extrabold text-fg no-underline hover:bg-surface hover:text-fg md:flex"
          >
            <Avatar
              name={user.name || user.organizer?.name || 'You'}
              className="size-7 rounded-full text-[11px]"
            />
            <span className="max-w-[120px] truncate">{firstName}</span>
          </Link>
        ) : (
          guest && (
            <>
              {pathname !== '/login' && (
                <Link
                  to={loginPath(pathname === '/' ? '/account' : pathname + search)}
                  className={buttonClass({
                    variant: 'outline',
                    size: 'sm',
                    className: 'text-fg',
                  })}
                >
                  Sign in
                </Link>
              )}
              {/* Accounts are for organizers, so signing up starts the organizer application. */}
              {pathname !== '/organizer/apply' && (
                <Link
                  to="/organizer/apply"
                  className={buttonClass({
                    size: 'sm',
                    className: 'text-accent-ink hover:text-accent-ink',
                  })}
                >
                  Sign up
                </Link>
              )}
            </>
          )
        )}

        <button
          type="button"
          onClick={() => {
            setThemePicked(true);
            toggleTheme();
          }}
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          className={buttonClass({
            variant: 'ghost',
            size: 'icon',
            className: cn(
              'flex-none',
              !themePicked && 'border-accent-text motion-safe:animate-ev-cta-ring',
            ),
          })}
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  );
}
