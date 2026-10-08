import { homePathFor, safeNextPath } from '@eventify/shared';
import { Link, Navigate, useSearchParams } from 'react-router';
import { ErrorState } from '../../components/PageStates';
import { Card } from '../../components/ui';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { TEST_LOOKUP_CODE, TEST_SIGN_INS } from '../../mocks/testPhones';
import { OtpForm } from './OtpForm';
import { useSession } from './useSession';

/**
 * /login: one sign-in for everyone. What you can do afterwards depends on the account: organizers
 * reach their dashboard, staff the admin portal, and anyone else their tickets.
 */
export function LoginPage() {
  const [params] = useSearchParams();
  const intent = params.get('intent');
  const hosting = intent === 'host';
  const creating = intent === 'create';
  useDocumentTitle(hosting ? 'Verify your email' : 'Sign in');
  const session = useSession();
  const next = safeNextPath(params.get('next'));

  if (session.status === 'signed-in') {
    return <Navigate to={next ?? homePathFor(session.user)} replace />;
  }
  if (session.status === 'loading') {
    return <div aria-busy="true" aria-label="Checking your account" className="flex-1" />;
  }
  if (session.status === 'error') {
    return <ErrorState onRetry={session.refetch}>Couldn't check your account.</ErrorState>;
  }

  return (
    <section className="mx-auto flex w-full max-w-[440px] flex-1 flex-col gap-6 px-5 pt-8 pb-12">
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-[32px] leading-[1.05] tracking-[-0.02em] text-balance">
          {hosting
            ? 'First, verify your email'
            : creating
              ? 'Sign in to create an event'
              : 'Sign in'}
        </h1>
        <p className="m-0 text-[15px] text-muted">
          {hosting
            ? "We'll email you a code. Your application is tied to this address."
            : creating
              ? "Only signed-in organizers can create events. Enter your email and we'll send you a code."
              : "Enter your email and we'll send you a code. No password to remember."}
        </p>
      </div>

      <Card className="p-5">
        <OtpForm
          submitLabel={hosting ? 'Continue' : 'Sign in'}
          hint={(fill) => <LoginTestHint onPick={fill} />}
        />
      </Card>

      <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm text-muted">
        <li>
          <strong className="text-fg">Just bought a ticket?</strong> You don't need to sign in.{' '}
          <Link to="/tickets" className="font-bold">
            Find my tickets
          </Link>
        </li>
        {!hosting && (
          <li>
            <strong className="text-fg">Want to host an event?</strong>{' '}
            <Link to="/organizer" className="font-bold">
              See how hosting works
            </Link>
          </li>
        )}
      </ul>
    </section>
  );
}

/** Only while the mock API is on: a sample account for each kind of user. */
function LoginTestHint({ onPick }: { onPick: (email: string) => void }) {
  if (import.meta.env.VITE_API_MOCKS === 'off') return null;
  return (
    <div className="flex flex-col gap-2 rounded-xl border-2 border-dashed border-hair p-3.5 text-xs text-muted">
      <span>
        <strong className="text-fg">Test mode</strong> · no email is sent. The code is always{' '}
        <code className="font-mono text-fg">{TEST_LOOKUP_CODE}</code>. Any other email signs in as a
        new attendee.
      </span>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {TEST_SIGN_INS.map((a) => (
          <li key={a.email}>
            <button
              type="button"
              onClick={() => onPick(a.email)}
              className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left hover:bg-surface"
            >
              <span className="font-semibold text-fg">{a.label}</span>
              <code className="flex-none font-mono whitespace-nowrap">{a.email}</code>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
