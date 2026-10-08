import { normalizeEmail } from '@eventify/shared';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Button, TextField } from '../../components/ui';
import { useStartSignIn, useVerifySignIn } from './useSession';

/**
 * Email, then the 6-digit code we send to it. There is no password: the email address is the
 * account.
 */
export function OtpForm({
  submitLabel,
  hint,
}: {
  submitLabel: string;
  /** Shown under both steps (the test-mode note). */
  hint?: (fill: (email: string) => void) => ReactNode;
}) {
  const [input, setInput] = useState('');
  const [email, setEmail] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [resent, setResent] = useState(false);
  const start = useStartSignIn();
  const verify = useVerifySignIn();

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

  const fill = (value: string) => {
    changeEmail();
    setInput(value);
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
        {hint?.(fill)}
      </form>
    );
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
      {hint?.(fill)}
    </form>
  );
}
