import { useState, type FormEvent } from 'react';
import { Button, Card, Tag, TextField } from '../../components/ui';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { useBeginTwoStep, useSetTwoStep, useTwoStepStatus } from '../auth/useSession';
import { AdminPage } from './AdminLayout';
import { QueryView } from './QueryView';

/**
 * /admin/security: two-step sign-in for the person signed in. With it on, signing in takes the
 * emailed code and a code from an authenticator app, so a stolen inbox alone is not enough.
 */
export function SecurityPage() {
  useDocumentTitle('Security');
  const status = useTwoStepStatus();
  return (
    <AdminPage title="Security" width="max-w-[640px]">
      <QueryView query={status} label="your security settings">
        {({ enabled }) => (
          <Card className="flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="m-0 text-lg">Two-step sign-in</h2>
              <Tag tone={enabled ? 'good' : 'neutral'}>{enabled ? 'On' : 'Off'}</Tag>
            </div>
            {enabled ? <TurnOff /> : <TurnOn />}
          </Card>
        )}
      </QueryView>
    </AdminPage>
  );
}

function CodeForm({
  label,
  submit,
  enabled,
  danger,
}: {
  label: string;
  submit: string;
  /** What the form switches two-step sign-in to. */
  enabled: boolean;
  danger?: boolean;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const change = useSetTwoStep(enabled);

  const onSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code');
    change.mutate(code);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      <TextField
        label={label}
        autoComplete="one-time-code"
        inputMode="numeric"
        maxLength={6}
        value={code}
        onChange={(ev) => {
          setCode(ev.target.value.replace(/\D/g, ''));
          setError(undefined);
          change.reset();
        }}
        error={error ?? change.error?.message}
        className="max-w-[240px] [&_input]:font-mono [&_input]:tracking-[0.3em]"
      />
      <Button
        type="submit"
        variant={danger ? 'outline' : undefined}
        className="self-start"
        disabled={change.isPending}
      >
        {change.isPending ? 'Checking…' : submit}
      </Button>
    </form>
  );
}

function TurnOn() {
  const begin = useBeginTwoStep();
  if (!begin.data) {
    return (
      <>
        <p className="m-0 text-sm text-muted">
          Signing in will ask for the emailed code and then a code from an authenticator app on your
          phone (Google Authenticator, Microsoft Authenticator, Authy and others all work). Super
          Admins need this on before they can approve organizers, change rates or record payouts.
        </p>
        <Button className="self-start" onClick={() => begin.mutate()} disabled={begin.isPending}>
          {begin.isPending ? 'Starting…' : 'Set up two-step sign-in'}
        </Button>
        {begin.error && (
          <p role="alert" className="m-0 text-sm text-danger">
            {begin.error.message}
          </p>
        )}
      </>
    );
  }
  return (
    <>
      <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-5 text-sm">
        <li>Open your authenticator app and choose to add an account.</li>
        <li>Scan this code, or type the key underneath it.</li>
        <li>Enter the 6-digit code the app then shows.</li>
      </ol>
      <img
        src={begin.data.qrDataUrl}
        alt="QR code to scan with your authenticator app"
        width={196}
        height={196}
        className="rounded-lg bg-white p-2"
      />
      <code className="font-mono text-xs break-all text-muted">{begin.data.secret}</code>
      <CodeForm label="Code from the app" submit="Turn on" enabled />
    </>
  );
}

function TurnOff() {
  return (
    <>
      <p className="m-0 text-sm text-muted">
        Signing in asks for a code from your authenticator app. To turn this off, or to move to a
        new phone, enter a code from the app; then set it up again.
      </p>
      <CodeForm label="Code from the app" submit="Turn off" enabled={false} danger />
    </>
  );
}
