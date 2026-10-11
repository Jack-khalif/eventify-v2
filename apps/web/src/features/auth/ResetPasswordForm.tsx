import { normalizeEmail, PASSWORD_MIN_LENGTH } from '@eventify/shared';
import { useState, type FormEvent } from 'react';
import { Button, PasswordField, TextField } from '../../components/ui';
import { TwoStepForm } from './OtpForm';
import { useFinishPasswordReset, useStartPasswordReset } from './useSession';

/**
 * A forgotten password: the email, then the 6-digit code we send to it together with the new
 * password. Finishing signs the organizer in.
 */
export function ResetPasswordForm({ initialEmail = '' }: { initialEmail?: string }) {
  const [input, setInput] = useState(initialEmail);
  const [email, setEmail] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; code?: string; password?: string }>({});
  const [resent, setResent] = useState(false);
  const start = useStartPasswordReset();
  const finish = useFinishPasswordReset();
  const challenge =
    finish.data && 'totpRequired' in finish.data ? finish.data.challenge : undefined;

  const send = (ev: FormEvent) => {
    ev.preventDefault();
    const normalized = normalizeEmail(input);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return setErrors({ email: 'Enter a valid email address' });
    }
    start.mutate(normalized, { onSuccess: () => setEmail(normalized) });
  };

  const save = (ev: FormEvent) => {
    ev.preventDefault();
    if (!email) return;
    const found = {
      code: /^\d{6}$/.test(code) ? undefined : 'Enter the 6-digit code',
      password:
        password.length >= PASSWORD_MIN_LENGTH
          ? undefined
          : `Use at least ${PASSWORD_MIN_LENGTH} characters`,
    };
    setErrors(found);
    if (!found.code && !found.password) finish.mutate({ email, code, password });
  };

  const changeEmail = () => {
    setEmail(null);
    setCode('');
    setPassword('');
    setErrors({});
    setResent(false);
    start.reset();
    finish.reset();
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
            setErrors({});
          }}
          error={errors.email}
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
    return <TwoStepForm challenge={challenge} submitLabel="Sign in" onRestart={changeEmail} />;
  }

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-4">
      <p className="m-0 text-[15px] text-muted">
        If <strong className="break-all text-fg">{email}</strong> has an organizer account, we've
        sent it a 6-digit code. It can take a minute to arrive; check your spam folder too.
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
          setErrors((e) => ({ ...e, code: undefined }));
          finish.reset();
        }}
        error={errors.code ?? finish.error?.message}
        className="[&_input]:font-mono [&_input]:tracking-[0.3em]"
      />
      <PasswordField
        label="New password"
        name="new-password"
        autoComplete="new-password"
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        value={password}
        onChange={(ev) => {
          setPassword(ev.target.value);
          setErrors((e) => ({ ...e, password: undefined }));
        }}
        error={errors.password}
      />
      <Button type="submit" size="lg" disabled={finish.isPending}>
        {finish.isPending ? 'Saving…' : 'Save password and sign in'}
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
      {start.error && (
        <p role="alert" className="m-0 text-sm text-danger">
          {start.error.message}
        </p>
      )}
    </form>
  );
}
