import type { AdminRole } from '@eventify/shared';
import { Moon, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { ScrollToTop } from '../../app/ScrollToTop';
import { useTheme } from '../../app/theme';
import { buttonClass, Segmented } from '../../components/ui';
import { cn } from '../../lib/cn';
import { useAdminMe, useApprovals, useSetDemoRole } from './useAdmin';

const ROLES = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'agent', label: 'Agent' },
] as const satisfies readonly { value: AdminRole; label: string }[];

/** Screens only a Super Admin can open. */
const SUPER_ONLY = ['/admin/approvals', '/admin/agents'];

/** Admin portal shell: its own header and nav, separate from the public site. */
export function AdminLayout() {
  const me = useAdminMe();
  const isSuper = me.data?.role === 'super_admin';
  const approvals = useApprovals({ enabled: isSuper });
  const setRole = useSetDemoRole();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { theme, toggleTheme } = useTheme();
  const pending = isSuper ? (approvals.data?.length ?? 0) : 0;

  const items: { to: string; label: ReactNode; end?: boolean; name: string }[] = [
    { to: '/admin', label: 'Overview', end: true, name: 'Overview' },
    { to: '/admin/organizers', label: 'Organizers', name: 'Organizers' },
    ...(isSuper
      ? [
          {
            to: '/admin/approvals',
            name: 'Approvals',
            label: (
              <>
                Approvals
                {pending > 0 && (
                  <span className="ml-1.5 rounded-full bg-accent px-1.5 py-px text-[10px] font-extrabold text-accent-ink">
                    {pending}
                    <span className="sr-only"> pending</span>
                  </span>
                )}
              </>
            ),
          },
          { to: '/admin/agents', label: 'Agents', name: 'Agents' },
        ]
      : []),
    { to: '/admin/payouts', label: 'Payouts', name: 'Payouts' },
  ];

  const switchRole = (role: AdminRole) => {
    setRole.mutate(role);
    if (role === 'agent' && SUPER_ONLY.some((p) => pathname.startsWith(p))) navigate('/admin');
  };

  const nav = (className: string) =>
    items.map((item) => (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        className={({ isActive }) =>
          cn(
            'flex-none no-underline hover:text-accent-text',
            isActive ? 'text-fg' : 'text-muted',
            className,
          )
        }
      >
        {item.label}
      </NavLink>
    ));

  return (
    <div className="flex min-h-dvh flex-col">
      <ScrollToTop />
      <header className="sticky top-0 z-40 border-b-2 border-rule bg-bg">
        <div className="mx-auto flex max-w-[1400px] items-center gap-5 px-5 py-3">
          <Link
            to="/admin"
            className="text-[15px] font-extrabold tracking-[0.18em] text-fg no-underline hover:text-fg"
          >
            EVENTIFY ADMIN
          </Link>
          <nav
            aria-label="Admin"
            className="mr-auto hidden gap-5 text-[13px] font-semibold lg:flex"
          >
            {nav('')}
          </nav>
          <span className="mr-auto lg:hidden" />
          {me.data && (
            <div className="flex items-center gap-2">
              <span className="hidden text-xs text-muted sm:inline">Viewing as</span>
              <Segmented
                label="Viewing as (demo until sign-in)"
                options={ROLES}
                value={me.data.role}
                onChange={switchRole}
              />
            </div>
          )}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            className={buttonClass({ variant: 'ghost', size: 'icon' })}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
        <nav
          aria-label="Admin sections"
          className="flex gap-5 overflow-x-auto border-t-2 border-hair px-5 py-2.5 text-[13px] font-semibold [scrollbar-width:none] lg:hidden"
        >
          {nav('')}
        </nav>
      </header>
      <main className="flex flex-1 flex-col">
        {me.data?.role === 'agent' && (
          <p className="m-0 bg-surface px-5 py-2 text-center text-xs">
            Viewing as agent <strong>{me.data.name}</strong>: only organizers you onboarded.
          </p>
        )}
        <Outlet />
      </main>
    </div>
  );
}

/** Page frame shared by the admin screens. */
export function AdminPage({
  title,
  actions,
  width = 'max-w-[1400px]',
  children,
}: {
  title: ReactNode;
  actions?: ReactNode;
  width?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('mx-auto flex w-full flex-col gap-5 px-5 pt-6 pb-12', width)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-[26px] tracking-[-0.02em]">{title}</h1>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
