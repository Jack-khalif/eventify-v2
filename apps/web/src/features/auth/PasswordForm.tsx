import { LEGAL_CONTACT, normalizeEmail } from '@eventify/shared';
import { useState, type FormEvent } from 'react';
import { Button, PasswordField, TextField } from '../../components/ui';
import { TwoStepForm } from './OtpForm';
import { usePasswordSignIn } from './useSession';

/** Email and password: how organizers sign in. */
export function PasswordForm({
  initialEmail = '',
  initialPassword = '',
}: {
  initialEmail?: string;
  initialPassword?: string;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState(initialPassword);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [forgot, setForgot] = useState(false);
  const signIn = usePasswordSignIn();
  const challenge =
    signIn.data && 'totpRequired' in signIn.data ? signIn.data.challenge : undefined;

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const normalized = normalizeEmail(email);
    const found = {
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
        ? undefined
        : 'Enter a valid email address',
      password: password ? undefined : 'Enter your password',
    };
    setErrors(found);
    if (!found.email && !found.password) signIn.mutate({ email: normalized, password });
  };

  if (challenge) {
    return <TwoStepForm challenge={challenge} submitLabel="Sign in" onRestart={signIn.reset} />;
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <TextField
        label="Email"
        type="email"
        name="email"
        autoComplete="username"
        inputMode="email"
        placeholder="you@example.com"
        value={email}
        onChange={(ev) => {
          setEmail(ev.target.value);
          setErrors((e) => ({ ...e, email: undefined }));
        }}
        error={errors.email}
      />
      <PasswordField
        label="Password"
        name="password"
        autoComplete="current-password"
        value={password}
        onChange={(ev) => {
          setPassword(ev.target.value);
          setErrors((e) => ({ ...e, password: undefined }));
          signIn.reset();
        }}
        error={errors.password}
      />
      {signIn.error && (
        <p role="alert" className="m-0 text-sm font-semibold text-danger">
          {signIn.error.message}
        </p>
      )}
      <Button type="submit" size="lg" disabled={signIn.isPending}>
        {signIn.isPending ? 'Signing in…' : 'Sign in'}
      </Button>
      {forgot ? (
        <p className="m-0 rounded-lg bg-surface p-3 text-sm text-muted">
          We can't send reset emails yet. Write to{' '}
          <a href={`mailto:${LEGAL_CONTACT.email}`} className="font-bold">
            {LEGAL_CONTACT.email}
          </a>{' '}
          from the address on your account and we'll set a new password with you.
        </p>
      ) : (
        <button
          type="button"
          onClick={() => setForgot(true)}
          className="cursor-pointer self-start rounded-md text-sm font-bold text-muted underline hover:text-fg"
        >
          Forgot your password?
        </button>
      )}
    </form>
  );
}
