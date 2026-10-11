import { PASSWORD_MIN_LENGTH } from '@eventify/shared';
import { useState, type FormEvent } from 'react';
import { Button, PasswordField } from '../../components/ui';
import { CodeField, EmailRow, TwoStepForm } from './CodeForm';
import { useFinishPasswordReset, useStartPasswordReset } from './useSession';

/**
 * A forgotten password: the 6-digit reset code we emailed to `email`, which the page has already
 * asked for, together with the new password. Finishing signs the organizer in.
 */
export function ResetPasswordForm({
  email,
  onChangeEmail,
}: {
  email: string;
  onChangeEmail: () => void;
}) {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ code?: string; password?: string }>({});
  const [resent, setResent] = useState(false);
  const resend = useStartPasswordReset();
  const finish = useFinishPasswordReset();
  const challenge =
    finish.data && 'totpRequired' in finish.data ? finish.data.challenge : undefined;

  const save = (ev: FormEvent) => {
    ev.preventDefault();
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

  if (challenge) {
    return <TwoStepForm challenge={challenge} submitLabel="Sign in" onRestart={onChangeEmail} />;
  }

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-4">
      <EmailRow email={email} onChange={onChangeEmail} />
      <p className="m-0 text-[15px] text-muted">
        If that address has an organizer account, we've sent it a 6-digit code. It can take a minute
        to arrive; check your spam folder too.
      </p>
      <CodeField
        label="Code"
        name="code"
        value={code}
        onChange={(digits) => {
          setCode(digits);
          setErrors((e) => ({ ...e, code: undefined }));
          finish.reset();
        }}
        error={errors.code ?? finish.error?.message}
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
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => resend.mutate(email, { onSuccess: () => setResent(true) })}
        disabled={resend.isPending}
      >
        {resent ? 'Code sent again' : 'Resend code'}
      </Button>
      {resend.error && (
        <p role="alert" className="m-0 text-sm text-danger">
          {resend.error.message}
        </p>
      )}
    </form>
  );
}
