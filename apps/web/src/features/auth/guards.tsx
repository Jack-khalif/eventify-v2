import { canCreateEvents, isStaff, type SessionUser } from '@eventify/shared';
import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { ErrorState } from '../../components/PageStates';
import { buttonClass } from '../../components/ui';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { loginPath } from './roles';
import { useSession } from './useSession';

/** Shown to someone signed in who opens a screen their account can't use. */
export function NoAccess({
  title = "You don't have access to this page",
  children,
  action,
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  useDocumentTitle('No access');
  return (
    <section className="mx-auto flex w-full max-w-[560px] flex-1 flex-col items-start gap-4 px-5 py-12">
      <span className="flex size-12 items-center justify-center rounded-xl bg-surface-2">
        <Lock size={22} aria-hidden />
      </span>
      <h1 className="m-0 text-[28px] tracking-[-0.02em] text-balance">{title}</h1>
      <p className="m-0 text-muted">{children}</p>
      <div className="flex flex-wrap gap-2.5">
        {action}
        <Link to="/" className={buttonClass({ variant: 'outline', size: 'md' })}>
          Back to Discover
        </Link>
      </div>
    </section>
  );
}

/**
 * Wait for the session, send guests to sign in (and back here afterwards), then let `children`
 * decide what this person sees.
 */
export function SignedIn({ children }: { children: (user: SessionUser) => ReactNode }) {
  const session = useSession();
  const { pathname, search } = useLocation();

  if (session.status === 'loading') {
    return <div aria-busy="true" aria-label="Checking your account" className="flex-1" />;
  }
  if (session.status === 'error') {
    return <ErrorState onRetry={session.refetch}>Couldn't check your account.</ErrorState>;
  }
  if (!session.user) return <Navigate to={loginPath(pathname + search)} replace />;
  return <>{children(session.user)}</>;
}

/** Publishing tools: approved organizers only. Everyone else goes to /organizer, which explains why. */
export function ActiveOrganizerOnly({ children }: { children: ReactNode }) {
  return (
    <SignedIn>
      {(user) => (canCreateEvents(user) ? children : <Navigate to="/organizer" replace />)}
    </SignedIn>
  );
}

/** The admin portal: Eventify staff only. */
export function StaffOnly({ children }: { children: ReactNode }) {
  return (
    <SignedIn>
      {(user) =>
        isStaff(user.role) ? (
          children
        ) : (
          <NoAccess>
            The admin portal is for Eventify staff. You're signed in as{' '}
            <strong className="text-fg">{user.name || 'an attendee'}</strong>.
          </NoAccess>
        )
      }
    </SignedIn>
  );
}
