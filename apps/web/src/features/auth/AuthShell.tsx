import { Moon, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ScrollToTop } from '../../app/ScrollToTop';
import { useTheme } from '../../app/theme';
import { SupportButton } from '../../components/SupportButton';
import { buttonClass } from '../../components/ui';
import { cn } from '../../lib/cn';

/** The two ways in. They are separate pages, so each has its own address to link to. */
export type AuthTab = 'sign-in' | 'create';

/** The size of the one main button on each step of signing in or signing up. */
export const AUTH_CTA = 'h-[52px] rounded-lg py-0';

/** Shown inside a button while it waits for the API. */
export function Spinner() {
  return (
    <span
      aria-hidden
      className="size-4 flex-none rounded-full border-2 border-current border-r-transparent motion-safe:animate-ev-spin"
    />
  );
}

function Lockup({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      aria-label="Eventify home"
      className={cn('flex items-center gap-2.5 no-underline', className)}
    >
      <img src="/eventify-mark.png" alt="" width={40} height={21} />
      <span className="text-[15px] font-extrabold tracking-[0.22em]">EVENTIFY</span>
    </Link>
  );
}

/**
 * The page around sign-in and sign-up: the form on its own, with a brand panel beside it on wide
 * screens. It replaces the site header, so the logo is the way back and the theme switch lives here.
 */
export function AuthShell({ tab, children }: { tab?: AuthTab; children: ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const [params] = useSearchParams();
  // Where sign-in was headed is kept when switching to it from the other tab.
  const query = params.get('next') ? `?${params.toString()}` : '';
  const tabs: { id: AuthTab; to: string; label: string }[] = [
    { id: 'sign-in', to: `/login${query}`, label: 'Sign in' },
    { id: 'create', to: '/organizer/apply', label: 'Create account' },
  ];

  return (
    <div className="flex min-h-dvh">
      <ScrollToTop />
      {/* The same dark teal in both themes: it is the brand, not the page. It stays put while a long form scrolls. */}
      <aside className="sticky top-0 hidden h-dvh w-[44%] flex-none flex-col justify-between self-start overflow-hidden bg-[#06292b] p-10 text-white min-[900px]:flex">
        <div
          aria-hidden
          className="absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(92,225,230,0.07)_0_2px,transparent_2px_22px)]"
        />
        <Lockup className="relative text-white hover:text-white" />
        <div className="relative flex max-w-[440px] flex-col gap-4">
          <p className="m-0 text-[40px] leading-[1.05] font-extrabold tracking-[-0.02em] text-balance">
            Put your event on sale in minutes.
          </p>
          <p className="m-0 text-base text-white/70">
            Publish an event, share one link and scan guests in at the door. Buying a ticket never
            needs an account.
          </p>
        </div>
        <p className="relative m-0 text-sm text-white/55">© {new Date().getFullYear()} Eventify</p>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col items-center px-5 pt-16 pb-12 min-[900px]:justify-center min-[900px]:pt-12">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          className={buttonClass({
            variant: 'ghost',
            size: 'icon',
            className: 'absolute top-4 right-4',
          })}
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="flex w-full max-w-[400px] flex-col gap-6">
          <Lockup className="self-start text-fg hover:text-fg min-[900px]:hidden" />
          {tab && (
            <nav aria-label="Account" className="grid grid-cols-2 gap-1 rounded-xl bg-surface p-1">
              {tabs.map((t) => (
                <Link
                  key={t.id}
                  to={t.to}
                  aria-current={t.id === tab ? 'page' : undefined}
                  className={cn(
                    'rounded-lg px-3 py-2.5 text-center text-sm font-extrabold no-underline',
                    t.id === tab
                      ? 'bg-bg text-fg hover:text-fg'
                      : 'text-muted hover:bg-surface-2 hover:text-fg',
                  )}
                >
                  {t.label}
                </Link>
              ))}
            </nav>
          )}
          {children}
        </div>
      </main>
      <SupportButton />
    </div>
  );
}

/** One step of the way in. Each new step eases in, unless the visitor asked for less motion. */
export function AuthStep({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-5 motion-safe:animate-ev-step">{children}</div>;
}

export function AuthHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="m-0 text-[30px] leading-[1.05] tracking-[-0.02em] text-balance">{title}</h1>
      {children && <p className="m-0 text-[15px] text-muted">{children}</p>}
    </div>
  );
}
