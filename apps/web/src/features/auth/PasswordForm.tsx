import { useState, type FormEvent } from 'react';
import { Button, PasswordField } from '../../components/ui';
import { AUTH_CTA, Spinner } from './AuthShell';
import { TwoStepForm } from './CodeForm';
import { usePasswordSignIn } from './useSession';

/** The password for `email`, which the page has already asked for. */
export function PasswordForm({
  email,
  onForgot,
  onRestart,
}: {
  email: string;
  onForgot: () => void;
  onRestart: () => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const signIn = usePasswordSignIn();
  const challenge =
    signIn.data && 'totpRequired' in signIn.data ? signIn.data.challenge : undefined;

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    if (!password) return setError('Enter your password');
    signIn.mutate({ email, password });
  };

  if (challenge) {
    return <TwoStepForm challenge={challenge} submitLabel="Sign in" onRestart={onRestart} />;
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {/* Not shown; tells a password manager which account the password belongs to. */}
      <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
      <PasswordField
        label="Password"
        name="password"
        autoComplete="current-password"
        autoFocus
        value={password}
        onChange={(ev) => {
          setPassword(ev.target.value);
          setError(undefined);
          signIn.reset();
        }}
        error={error ?? signIn.error?.message}
      />
      <Button type="submit" size="lg" className={AUTH_CTA} disabled={signIn.isPending}>
        {signIn.isPending ? (
          <>
            <Spinner /> Signing in…
          </>
        ) : (
          'Sign in'
        )}
      </Button>
      <button
        type="button"
        onClick={onForgot}
        className="cursor-pointer self-start rounded-md text-sm font-bold text-muted underline hover:text-fg"
      >
        Forgot your password?
      </button>
    </form>
  );
}
