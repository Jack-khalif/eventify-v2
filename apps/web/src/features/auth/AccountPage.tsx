import { canCreateEvents, formatPhone, isStaff, type SessionUser } from '@eventify/shared';
import {
  ChevronRight,
  Heart,
  LayoutDashboard,
  Megaphone,
  PlusCircle,
  ShieldCheck,
  Store,
  Ticket,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router';
import { Avatar } from '../../components/Avatar';
import { ErrorState } from '../../components/PageStates';
import { Button, buttonClass, Card, Tag } from '../../components/ui';
import { useSavedEvents } from '../../lib/saved';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { loginPath, roleBadge } from './roles';
import { useSession, useSignOut } from './useSession';

type Row = { to: string; icon: LucideIcon; label: string; note?: string };

/** /account: the Profile tab. Guests get a way in; everyone else sees what their account can do. */
export function AccountPage() {
  useDocumentTitle('Profile');
  const session = useSession();
  const saved = useSavedEvents().ids.length;

  if (session.status === 'loading') {
    return <div aria-busy="true" aria-label="Loading your profile" className="flex-1" />;
  }
  if (session.status === 'error') {
    return <ErrorState onRetry={session.refetch}>Couldn't load your profile.</ErrorState>;
  }

  const user = session.user;
  const everyone: Row[] = [
    { to: '/tickets', icon: Ticket, label: 'Your tickets', note: 'Passes for events you booked' },
    {
      to: '/saved',
      icon: Heart,
      label: 'Saved events',
      note: saved ? `${saved} saved on this device` : 'Nothing saved yet',
    },
  ];

  return (
    <section className="mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-6 px-5 pt-6 pb-12">
      <h1 className="m-0 text-[28px] tracking-[-0.02em]">Profile</h1>

      {user ? <Identity user={user} /> : <GuestCard />}

      {user && <RoleLinks user={user} />}

      <Links title={user ? 'Your events' : 'On this device'} rows={everyone} />

      {(!user || user.role === 'attendee') && (
        <Links
          title="Hosting"
          rows={[
            {
              to: '/organizer',
              icon: Megaphone,
              label: 'Host an event',
              note: 'Apply to sell tickets on Eventify',
            },
          ]}
        />
      )}

      {user && <SignOut />}
    </section>
  );
}

function GuestCard() {
  return (
    <Card variant="surface" className="flex flex-col items-start gap-3 p-5">
      <span className="text-lg font-extrabold">You're browsing as a guest</span>
      <span className="text-sm text-muted">
        You can buy tickets and find them again without an account. Sign in if you host events, or
        to keep your tickets one tap away.
      </span>
      <Link
        to={loginPath('/account')}
        className={buttonClass({ className: 'text-accent-ink hover:text-accent-ink' })}
      >
        Sign in
      </Link>
    </Card>
  );
}

function Identity({ user }: { user: SessionUser }) {
  const badge = roleBadge(user);
  const name = user.organizer?.name ?? user.name;
  return (
    <div className="flex items-center gap-4">
      <Avatar name={name || 'You'} className="size-14 rounded-2xl text-lg" />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-xl font-extrabold tracking-[-0.01em]">
          {name || 'Your account'}
        </span>
        <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
          {formatPhone(user.phone)}
          <Tag tone={badge.tone}>{badge.label}</Tag>
        </span>
      </div>
    </div>
  );
}

/** The part of the profile that differs by role. */
function RoleLinks({ user }: { user: SessionUser }) {
  if (isStaff(user.role)) {
    return (
      <Links
        title="Eventify staff"
        rows={[
          {
            to: '/admin',
            icon: ShieldCheck,
            label: 'Admin portal',
            note:
              user.role === 'agent'
                ? 'Organizers you onboarded, rates and payouts'
                : 'Organizers, approvals, agents and payouts',
          },
        ]}
      />
    );
  }
  if (user.role !== 'organizer' || !user.organizer) return null;

  const { status, handle } = user.organizer;
  if (status === 'pending' || status === 'rejected') {
    return (
      <Links
        title="Hosting"
        rows={[
          {
            to: '/organizer',
            icon: Megaphone,
            label: status === 'pending' ? 'Application in review' : 'Application declined',
            note:
              status === 'pending' ? "We'll text you when it's approved" : 'See what to do next',
          },
        ]}
      />
    );
  }
  return (
    <Links
      title="Organizer tools"
      rows={[
        {
          to: '/organizer',
          icon: LayoutDashboard,
          label: 'Dashboard',
          note: 'Sales, payouts and check-ins',
        },
        ...(canCreateEvents(user)
          ? [{ to: '/organizer/events/new', icon: PlusCircle, label: 'Create event' }]
          : []),
        { to: `/${handle}`, icon: Store, label: 'Your public page', note: `eventify.co/${handle}` },
      ]}
    />
  );
}

function Links({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <nav aria-label={title} className="flex flex-col gap-2">
      <h2 className="m-0 text-xs font-extrabold tracking-[0.08em] text-muted uppercase">{title}</h2>
      <ul className="m-0 flex list-none flex-col border-t-2 border-rule p-0">
        {rows.map(({ to, icon: Icon, label, note }) => (
          <li key={to}>
            <Link
              to={to}
              className="flex items-center gap-3.5 border-b-2 border-hair px-1 py-3.5 text-fg no-underline hover:bg-surface"
            >
              <Icon size={20} className="flex-none text-accent-text" aria-hidden />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-extrabold">{label}</span>
                {note && <span className="truncate text-xs text-muted">{note}</span>}
              </span>
              <ChevronRight size={18} className="flex-none text-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SignOut() {
  const signOut = useSignOut();
  return (
    <Button
      variant="outline"
      className="self-start"
      disabled={signOut.isPending}
      onClick={() => signOut.mutate()}
    >
      {signOut.isPending ? 'Signing out…' : 'Sign out'}
    </Button>
  );
}
