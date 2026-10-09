import { normalizeEmail } from '@eventify/shared';
import { useState, type FormEvent } from 'react';
import { Button, TextField } from '../../components/ui';
import { useCompleteTwoStep, useStartSignIn, useVerifySignIn } from './useSession';

/**
 * Email, then the 6-digit code we send to it. How staff sign in, and how anyone shows an address
 * is theirs.
 */
export function OtpForm({
  submitLabel,
  initialEmail = '',
}: {
  submitLabel: string;
  initialEmail?: string;
}) {
  const [input, setInput] = useState(initialEmail);
  const [email, setEmail] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [resent, setResent] = useState(false);
  const start = useStartSignIn();
  const verify = useVerifySignIn();
  /** Set once the emailed code was right for an account that also uses an authenticator app. */
  const challenge =
    verify.data && 'totpRequired' in verify.data ? verify.data.challenge : undefined;

  const send = (ev: FormEvent) => {
    ev.preventDefault();
    const normalized = normalizeEmail(input);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return setError('Enter a valid email address');
    }
    start.mutate(normalized, { onSuccess: () => setEmail(normalized) });
  };

  const check = (ev: FormEvent) => {
    ev.preventDefault();
    if (!email) return;
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code');
    verify.mutate({ email, code });
  };

  const changeEmail = () => {
    setEmail(null);
    setCode('');
    setError(undefined);
    setResent(false);
    start.reset();
    verify.reset();
  };

  if (!email) {
    return (
      <form onSubmit={send} noValidate className="flex flex-col gap-4">
        <TextField
          label="Email"
          type="email"
          name="email"
          autoComplete="username"
          inputMode="email"
          placeholder="you@example.com"
          value={input}
          onChange={(ev) => {
            setInput(ev.target.value);
            setError(undefined);
          }}
          error={error}
        />
        <Button type="submit" size="lg" disabled={start.isPending}>
          {start.isPending ? 'Sending…' : 'Email me a code'}
        </Button>
        {start.error && (
          <p role="alert" className="m-0 text-sm text-danger">
            {start.error.message}
          </p>
        )}
      </form>
    );
  }

  if (challenge) {
    return <TwoStepForm challenge={challenge} submitLabel={submitLabel} onRestart={changeEmail} />;
  }

  return (
    <form onSubmit={check} noValidate className="flex flex-col gap-4">
      <p className="m-0 text-[15px] text-muted">
        We sent a 6-digit code to <strong className="break-all text-fg">{email}</strong>. It can
        take a minute to arrive; check your spam folder too.
      </p>
      <TextField
        label="Code"
        name="code"
        autoComplete="one-time-code"
        inputMode="numeric"
        maxLength={6}
        autoFocus
        value={code}
        onChange={(ev) => {
          setCode(ev.target.value.replace(/\D/g, ''));
          setError(undefined);
          verify.reset();
        }}
        error={error ?? verify.error?.message}
        className="[&_input]:font-mono [&_input]:tracking-[0.3em]"
      />
      <Button type="submit" size="lg" disabled={verify.isPending}>
        {verify.isPending ? 'Checking…' : submitLabel}
      </Button>
      <div className="flex flex-wrap gap-2.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => start.mutate(email, { onSuccess: () => setResent(true) })}
          disabled={start.isPending}
        >
          {resent ? 'Code sent again' : 'Resend code'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="border-transparent text-muted"
          onClick={changeEmail}
        >
          Use a different email
        </Button>
      </div>
    </form>
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
    twoStep.mutate({ challenge, code: appCode });
  };

  return (
    <form onSubmit={checkApp} noValidate className="flex flex-col gap-4">
      <p className="m-0 text-[15px] text-muted">
        This account uses two-step sign-in. Open your authenticator app and enter the 6-digit code
        it shows for <strong className="text-fg">Eventify</strong>.
      </p>
      <TextField
        label="Authenticator code"
        name="app-code"
        autoComplete="one-time-code"
        inputMode="numeric"
        maxLength={6}
        autoFocus
        value={appCode}
        onChange={(ev) => {
          setAppCode(ev.target.value.replace(/\D/g, ''));
          setError(undefined);
          twoStep.reset();
        }}
        error={error ?? twoStep.error?.message}
        className="[&_input]:font-mono [&_input]:tracking-[0.3em]"
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
