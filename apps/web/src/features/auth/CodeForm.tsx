import { useState, type FormEvent } from 'react';
import { Button, TextField } from '../../components/ui';
import { AUTH_CTA, Spinner } from './AuthShell';
import { OtpBoxes } from './OtpBoxes';
import { useResendWait } from './useResendWait';
import { useCompleteTwoStep, useStartSignIn, useVerifySignIn } from './useSession';

/**
 * A box for a 6-digit code. Anything that isn't a digit is dropped, so a code pasted as "482 913"
 * or with the words around it still fits, and `onComplete` fires as soon as all six are in.
 */
export function CodeField({
  label,
  name,
  value,
  onChange,
  onComplete,
  error,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (digits: string) => void;
  onComplete?: (digits: string) => void;
  error?: string;
}) {
  return (
    <TextField
      label={label}
      name={name}
      autoComplete="one-time-code"
      inputMode="numeric"
      autoFocus
      value={value}
      onChange={(ev) => {
        const digits = ev.target.value.replace(/\D/g, '').slice(0, 6);
        onChange(digits);
        if (digits.length === 6 && digits !== value) onComplete?.(digits);
      }}
      error={error}
      className="[&_input]:font-mono [&_input]:tracking-[0.3em]"
    />
  );
}

/** The address a code or password is being asked for, with a way back to change it. */
export function EmailRow({ email, onChange }: { email: string; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-surface px-3.5 py-2.5">
      <span className="min-w-0 text-sm font-bold break-all">{email}</span>
      <button
        type="button"
        onClick={onChange}
        className="flex-none cursor-pointer rounded-md text-sm font-bold text-muted underline hover:text-fg"
      >
        Change
      </button>
    </div>
  );
}

/**
 * The 6-digit code we emailed to `email`, which the page has already asked for. How staff sign
 * in, and how anyone signs in without a password.
 */
export function CodeForm({ email, onChangeEmail }: { email: string; onChangeEmail: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const resend = useStartSignIn();
  const verify = useVerifySignIn();
  /** Set once the emailed code was right for an account that also uses an authenticator app. */
  const challenge =
    verify.data && 'totpRequired' in verify.data ? verify.data.challenge : undefined;

  const check = (ev: FormEvent) => {
    ev.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code');
    if (!verify.isPending) verify.mutate({ email, code });
  };

  if (challenge) {
    return <TwoStepForm challenge={challenge} submitLabel="Sign in" onRestart={onChangeEmail} />;
  }

  return (
    <form onSubmit={check} noValidate className="flex flex-col gap-4">
      <EmailRow email={email} onChange={onChangeEmail} />
      <p className="m-0 text-[15px] text-muted">
        It can take a minute to arrive; check your spam folder too.
      </p>
      <OtpBoxes
        label="Code"
        value={code}
        onChange={(digits) => {
          setCode(digits);
          setError(undefined);
          verify.reset();
        }}
        onComplete={(digits) => verify.mutate({ email, code: digits })}
        error={error ?? verify.error?.message}
      />
      <Button type="submit" size="lg" className={AUTH_CTA} disabled={verify.isPending}>
        {verify.isPending ? (
          <>
            <Spinner /> Checking…
          </>
        ) : (
          'Sign in'
        )}
      </Button>
      <ResendCode email={email} resend={resend} />
    </form>
  );
}

/** Ask for the code again, once the first has had half a minute to arrive. */
export function ResendCode({
  email,
  resend,
}: {
  email: string;
  resend: ReturnType<typeof useStartSignIn>;
}) {
  const wait = useResendWait();
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        disabled={wait.left > 0 || resend.isPending}
        onClick={() => resend.mutate(email, { onSuccess: wait.restart })}
        className="cursor-pointer self-start rounded-md text-sm font-bold text-accent-text underline hover:text-fg disabled:cursor-default disabled:text-muted disabled:no-underline"
      >
        {wait.left > 0
          ? `Resend code in ${wait.left}s`
          : resend.isPending
            ? 'Sending…'
            : 'Resend code'}
      </button>
      {resend.isSuccess && wait.left > 0 && (
        <span role="status" className="text-sm text-muted">
          We sent a new code.
        </span>
      )}
      {resend.error && (
        <p role="alert" className="m-0 text-sm text-danger">
          {resend.error.message}
        </p>
      )}
    </div>
  );
}

/** The second step for accounts with an authenticator app, after the code or the password. */
export function TwoStepForm({
  challenge,
  submitLabel,
  onRestart,
}: {
  challenge: string;
  submitLabel: string;
  onRestart: () => void;
}) {
  const twoStep = useCompleteTwoStep();
  const [appCode, setAppCode] = useState('');
  const [error, setError] = useState<string>();

  const checkApp = (ev: FormEvent) => {
    ev.preventDefault();
    if (!/^\d{6}$/.test(appCode)) return setError('Enter the 6-digit code');
    if (!twoStep.isPending) twoStep.mutate({ challenge, code: appCode });
  };

  return (
    <form onSubmit={checkApp} noValidate className="flex flex-col gap-4">
      <p className="m-0 text-[15px] text-muted">
        This account uses two-step sign-in. Open your authenticator app and enter the 6-digit code
        it shows for <strong className="text-fg">Eventify</strong>.
      </p>
      <CodeField
        label="Authenticator code"
        name="app-code"
        value={appCode}
        onChange={(digits) => {
          setAppCode(digits);
          setError(undefined);
          twoStep.reset();
        }}
        onComplete={(digits) => twoStep.mutate({ challenge, code: digits })}
        error={error ?? twoStep.error?.message}
      />
      <Button type="submit" size="lg" disabled={twoStep.isPending}>
        {twoStep.isPending ? 'Checking…' : submitLabel}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="self-start border-transparent text-muted"
        onClick={onRestart}
      >
        Start again
      </Button>
    </form>
  );
}
