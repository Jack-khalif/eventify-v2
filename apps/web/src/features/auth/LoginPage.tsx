import { homePathFor, normalizeEmail, safeNextPath } from '@eventify/shared';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { ErrorState } from '../../components/PageStates';
import { Button, Card, TextField } from '../../components/ui';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { TEST_LOOKUP_CODE, TEST_PASSWORD, TEST_SIGN_INS } from '../../mocks/testPhones';
import { CodeForm, EmailRow } from './CodeForm';
import { PasswordForm } from './PasswordForm';
import { ResetPasswordForm } from './ResetPasswordForm';
import { useSession, useStartPasswordReset, useStartSignIn } from './useSession';

/** Where the person is on the way in. The email is asked for once and carried along. */
type Step =
  | { at: 'email'; email: string }
  | { at: 'choose'; email: string; password: string }
  | { at: 'code' | 'reset'; email: string };

/**
 * /login: the email first, then either the password or a 6-digit code sent to that address.
 * Organizers can use either; Eventify staff use the code. Buyers never need it. What you reach
 * afterwards depends on the account.
 */
export function LoginPage() {
  const [params] = useSearchParams();
  const creating = params.get('intent') === 'create';
  useDocumentTitle('Sign in');
  const session = useSession();
  const next = safeNextPath(params.get('next'));
  const [step, setStep] = useState<Step>({ at: 'email', email: '' });
  const [visit, setVisit] = useState(0);
  const sendCode = useStartSignIn();
  const sendReset = useStartPasswordReset();

  if (session.status === 'signed-in') {
    return <Navigate to={next ?? homePathFor(session.user)} replace />;
  }
  if (session.status === 'loading') {
    return <div aria-busy="true" aria-label="Checking your account" className="flex-1" />;
  }
  if (session.status === 'error') {
    return <ErrorState onRetry={session.refetch}>Couldn't check your account.</ErrorState>;
  }

  const go = (to: Step) => {
    sendCode.reset();
    sendReset.reset();
    setStep(to);
    // Each arrival gets forms of its own, so a picked test account refills them.
    setVisit((v) => v + 1);
  };
  const { email } = step;
  const startAgain = () => go({ at: 'email', email });
  const sending = sendCode.isPending || sendReset.isPending;
  const sendError = sendCode.error ?? sendReset.error;

  const heading = {
    email: creating ? 'Sign in to create an event' : 'Sign in',
    choose: 'Welcome back',
    code: 'Check your email',
    reset: 'Choose a new password',
  }[step.at];
  const lead = {
    email: creating
      ? 'You need an organizer account to create events.'
      : 'For event organizers. Buying a ticket needs no account.',
    choose: 'Enter your password, or get a 6-digit code by email instead.',
    code: 'We sent a 6-digit code to your address.',
    reset: 'Enter the code and the password you want from now on.',
  }[step.at];

  return (
    <section className="mx-auto flex w-full max-w-[420px] flex-1 flex-col gap-5 px-5 pt-10 pb-12">
      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 text-[32px] leading-[1.05] tracking-[-0.02em] text-balance">
          {heading}
        </h1>
        <p className="m-0 text-[15px] text-muted">{lead}</p>
      </div>

      <Card className="flex flex-col gap-4 p-5">
        {step.at === 'email' && (
          <EmailForm
            key={visit}
            initialEmail={email}
            onContinue={(address) => go({ at: 'choose', email: address, password: '' })}
          />
        )}
        {step.at === 'choose' && (
          <>
            <EmailRow email={email} onChange={startAgain} />
            <PasswordForm
              key={visit}
              email={email}
              initialPassword={step.password}
              onForgot={() =>
                sendReset.mutate(email, { onSuccess: () => go({ at: 'reset', email }) })
              }
              onRestart={startAgain}
            />
            <div className="flex flex-col gap-3 border-t-2 border-hair pt-4">
              <Button
                variant="outline"
                block
                disabled={sending}
                onClick={() =>
                  sendCode.mutate(email, { onSuccess: () => go({ at: 'code', email }) })
                }
              >
                {sending ? 'Sending…' : 'Email me a code instead'}
              </Button>
              <span className="text-sm text-muted">Eventify staff sign in with the code.</span>
              {sendError && (
                <p role="alert" className="m-0 text-sm font-semibold text-danger">
                  {sendError.message}
                </p>
              )}
            </div>
          </>
        )}
        {step.at === 'code' && <CodeForm email={email} onChangeEmail={startAgain} />}
        {step.at === 'reset' && <ResetPasswordForm email={email} onChangeEmail={startAgain} />}
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

      <TestAccounts
        onPick={(address, password) => go({ at: 'choose', email: address, password })}
      />
    </section>
  );
}

/** The first thing asked: which account. */
function EmailForm({
  initialEmail,
  onContinue,
}: {
  initialEmail: string;
  onContinue: (email: string) => void;
}) {
  const [input, setInput] = useState(initialEmail);
  const [error, setError] = useState<string>();

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const normalized = normalizeEmail(input);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return setError('Enter a valid email address');
    }
    onContinue(normalized);
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <TextField
        label="Email"
        type="email"
        name="email"
        autoComplete="username"
        inputMode="email"
        placeholder="you@example.com"
        autoFocus
        value={input}
        onChange={(ev) => {
          setInput(ev.target.value);
          setError(undefined);
        }}
        error={error}
      />
      <Button type="submit" size="lg">
        Continue
      </Button>
    </form>
  );
}

/** Only while the mock API is on: a sample account for each kind of user, tucked out of the way. */
function TestAccounts({ onPick }: { onPick: (email: string, password: string) => void }) {
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
                onClick={() => onPick(a.email, a.staff ? '' : TEST_PASSWORD)}
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
