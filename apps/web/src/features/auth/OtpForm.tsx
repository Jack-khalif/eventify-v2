import { formatPhone, normalizePhone } from '@eventify/shared';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Button, TextField } from '../../components/ui';
import { useStartSignIn, useVerifySignIn } from './useSession';

/**
 * Phone, then the 6-digit code we text to it. There is no password: the phone is the account,
 * the same way buyers prove a ticket is theirs.
 */
export function OtpForm({
  submitLabel,
  initialPhone = '',
  hint,
}: {
  submitLabel: string;
  initialPhone?: string;
  /** Shown under both steps (the test-mode note). */
  hint?: (fill: (phone: string) => void) => ReactNode;
}) {
  const [input, setInput] = useState(initialPhone);
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [resent, setResent] = useState(false);
  const start = useStartSignIn();
  const verify = useVerifySignIn();

  const send = (ev: FormEvent) => {
    ev.preventDefault();
    const normalized = normalizePhone(input);
    if (!normalized) return setError('Enter a valid phone number');
    start.mutate(normalized, { onSuccess: () => setPhone(normalized) });
  };

  const check = (ev: FormEvent) => {
    ev.preventDefault();
    if (!phone) return;
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code');
    verify.mutate({ phone, code });
  };

  const changeNumber = () => {
    setPhone(null);
    setCode('');
    setError(undefined);
    setResent(false);
    start.reset();
    verify.reset();
  };

  const fill = (value: string) => {
    changeNumber();
    setInput(value);
  };

  if (!phone) {
    return (
      <form onSubmit={send} noValidate className="flex flex-col gap-4">
        <TextField
          label="Phone number"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          placeholder="07XX XXX XXX"
          value={input}
          onChange={(ev) => {
            setInput(ev.target.value);
            setError(undefined);
          }}
          error={error}
          hint="Kenya (+254) or South Sudan (+211)."
        />
        <Button type="submit" size="lg" disabled={start.isPending}>
          {start.isPending ? 'Sending…' : 'Text me a code'}
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
        We sent a 6-digit code to{' '}
        <strong className="whitespace-nowrap text-fg">{formatPhone(phone)}</strong>.
      </p>
      <TextField
        label="Code"
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
          onClick={() => start.mutate(phone, { onSuccess: () => setResent(true) })}
          disabled={start.isPending}
        >
          {resent ? 'Code sent again' : 'Resend code'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="border-transparent text-muted"
          onClick={changeNumber}
        >
          Use a different number
        </Button>
      </div>
      {hint?.(fill)}
    </form>
  );
}
