import { homePathFor, safeNextPath } from '@eventify/shared';
import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { ErrorState } from '../../components/PageStates';
import { Card } from '../../components/ui';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { TEST_LOOKUP_CODE, TEST_PASSWORD, TEST_SIGN_INS } from '../../mocks/testPhones';
import { OtpForm } from './OtpForm';
import { PasswordForm } from './PasswordForm';
import { useSession } from './useSession';

type Way = 'password' | 'code';

/**
 * /login: for organizers (email and password) and Eventify staff (a code sent by email). Buyers
 * never need it. What you reach afterwards depends on the account.
 */
export function LoginPage() {
  const [params] = useSearchParams();
  const creating = params.get('intent') === 'create';
  useDocumentTitle('Sign in');
  const session = useSession();
  const next = safeNextPath(params.get('next'));
  // Picking a test account refills the form, so each pick gets a form of its own.
  const [form, setForm] = useState<{ way: Way; email: string; password: string; key: number }>({
    way: 'password',
    email: '',
    password: '',
    key: 0,
  });
  const show = (way: Way, email = '', password = '') =>
    setForm((f) => ({ way, email, password, key: f.key + 1 }));

  if (session.status === 'signed-in') {
    return <Navigate to={next ?? homePathFor(session.user)} replace />;
  }
  if (session.status === 'loading') {
    return <div aria-busy="true" aria-label="Checking your account" className="flex-1" />;
  }
  if (session.status === 'error') {
    return <ErrorState onRetry={session.refetch}>Couldn't check your account.</ErrorState>;
  }

  const byCode = form.way === 'code';

  return (
    <section className="mx-auto flex w-full max-w-[420px] flex-1 flex-col gap-5 px-5 pt-10 pb-12">
      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 text-[32px] leading-[1.05] tracking-[-0.02em] text-balance">
          {creating ? 'Sign in to create an event' : 'Sign in'}
        </h1>
        <p className="m-0 text-[15px] text-muted">
          {byCode
            ? "We'll email you a 6-digit code. Eventify staff sign in this way."
            : creating
              ? 'Only approved organizers can create events.'
              : 'For event organizers. Buying a ticket needs no account.'}
        </p>
      </div>

      <Card className="flex flex-col gap-4 p-5">
        {byCode ? (
          <OtpForm key={form.key} submitLabel="Sign in" initialEmail={form.email} />
        ) : (
          <PasswordForm key={form.key} initialEmail={form.email} initialPassword={form.password} />
        )}
        <div className="border-t-2 border-hair pt-3.5">
          <button
            type="button"
            onClick={() => show(byCode ? 'password' : 'code')}
            className="cursor-pointer rounded-md text-left text-sm font-bold text-muted hover:text-fg"
          >
            {byCode ? 'Use a password instead' : 'Eventify staff? Sign in with an emailed code'}
          </button>
        </div>
      </Card>

      <Card variant="surface" className="flex flex-col gap-1 p-4">
        <span className="font-extrabold">New to Eventify?</span>
        <span className="text-sm text-muted">
          Sell tickets to your own events.{' '}
          <Link to="/organizer/apply" className="font-bold">
            Create an organizer account
          </Link>
        </span>
      </Card>

      <p className="m-0 text-sm text-muted">
        Looking for a ticket you bought?{' '}
        <Link to="/tickets" className="font-bold">
          Find my tickets
        </Link>
        {' · '}
        <Link to="/privacy" className="font-bold">
          Privacy Notice
        </Link>
      </p>

      <TestAccounts onPick={show} />
    </section>
  );
}

/** Only while the mock API is on: a sample account for each kind of user, tucked out of the way. */
function TestAccounts({ onPick }: { onPick: (way: Way, email: string, password: string) => void }) {
  if (import.meta.env.VITE_API_MOCKS === 'off') return null;
  return (
    <details className="rounded-xl border-2 border-dashed border-hair text-xs text-muted">
      <summary className="cursor-pointer px-3.5 py-2.5 font-bold text-fg">
        Test mode: sample accounts
      </summary>
      <div className="flex flex-col gap-2 px-3.5 pb-3.5">
        <span>
          Nothing is emailed. Organizers use the password{' '}
          <code className="font-mono text-fg">{TEST_PASSWORD}</code>; staff use the code{' '}
          <code className="font-mono text-fg">{TEST_LOOKUP_CODE}</code>.
        </span>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {TEST_SIGN_INS.map((a) => (
            <li key={a.email}>
              <button
                type="button"
                onClick={() =>
                  a.staff ? onPick('code', a.email, '') : onPick('password', a.email, TEST_PASSWORD)
                }
                className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left hover:bg-surface"
              >
                <span className="font-semibold text-fg">{a.label}</span>
                <code className="flex-none font-mono whitespace-nowrap">{a.email}</code>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
