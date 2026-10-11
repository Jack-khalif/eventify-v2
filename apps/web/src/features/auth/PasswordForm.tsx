import { normalizeEmail } from '@eventify/shared';
import { useState, type FormEvent } from 'react';
import { Button, PasswordField, TextField } from '../../components/ui';
import { TwoStepForm } from './OtpForm';
import { usePasswordSignIn } from './useSession';

/** Email and password: how organizers sign in. */
export function PasswordForm({
  initialEmail = '',
  initialPassword = '',
  onForgot,
}: {
  initialEmail?: string;
  initialPassword?: string;
  /** Asked for a new password; given whatever email is in the box so it needn't be typed again. */
  onForgot: (email: string) => void;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState(initialPassword);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
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
      <button
        type="button"
        onClick={() => onForgot(email)}
        className="cursor-pointer self-start rounded-md text-sm font-bold text-muted underline hover:text-fg"
      >
        Forgot your password?
      </button>
    </form>
  );
}
