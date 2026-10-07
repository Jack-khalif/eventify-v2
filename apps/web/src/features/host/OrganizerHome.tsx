import { ErrorState } from '../../components/PageStates';
import { useSession } from '../auth/useSession';
import { DashboardPage } from '../dashboard/DashboardPage';
import { ApplicationStatus } from './ApplicationStatus';
import { HostPage } from './HostPage';

/**
 * /organizer means something different to each visitor: the pitch for guests and attendees, the
 * application's progress for applicants, and the dashboard for organizers.
 */
export function OrganizerHome() {
  const session = useSession();

  if (session.status === 'loading') {
    return <div aria-busy="true" aria-label="Checking your account" className="flex-1" />;
  }
  if (session.status === 'error') {
    return <ErrorState onRetry={session.refetch}>Couldn't check your account.</ErrorState>;
  }

  const organizer = session.user?.organizer;
  if (!organizer) return <HostPage user={session.user} />;
  if (organizer.status === 'pending' || organizer.status === 'rejected') {
    return <ApplicationStatus organizer={organizer} />;
  }
  return <DashboardPage />;
}
