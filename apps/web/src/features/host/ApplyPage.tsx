import {
  canApplyToHost,
  CITIES,
  ORGANIZER_TERMS_VERSION,
  organizerApplicationRequestSchema,
  organizerSignUpRequestSchema,
  PASSWORD_MIN_LENGTH,
  PRIVACY_NOTICE_VERSION,
  slugify,
  type OrganizerSignUpRequest,
  type SessionUser,
} from '@eventify/shared';
import { Check } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router';
import { ErrorState } from '../../components/PageStates';
import {
  Button,
  buttonClass,
  CheckboxField,
  PasswordField,
  SelectField,
  TextField,
} from '../../components/ui';
import { ApiError } from '../../lib/api';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { AUTH_CTA, AuthHeading, AuthShell, AuthStep, Spinner } from '../auth/AuthShell';
import { MockCodeHint, ResendCode } from '../auth/CodeForm';
import { OtpBoxes } from '../auth/OtpBoxes';
import {
  useApplyToHost,
  useSession,
  useSignUpOrganizer,
  useStartSignIn,
  useVerifySignIn,
} from '../auth/useSession';
type Agreement = 'acceptTerms' | 'consentToDataProcessing';
/** What the form asks. What describes them and what they host is left out: the API has defaults. */
type Draft = Record<
  'email' | 'password' | 'contactName' | 'organizerName' | 'city' | 'payoutMethod',
  string
>;
type Errors = Partial<Record<keyof Draft | Agreement, string>>;
type SignUp = ReturnType<typeof useSignUpOrganizer>;
type SendCode = ReturnType<typeof useStartSignIn>;

const PAYOUT_LABEL = { mpesa: 'M-Pesa', bank: 'Bank transfer' } as const;

/**
 * /organizer/apply: become an organizer. A guest makes their account here in three steps on one
 * screen: the form, the 6-digit code we email to show the address is theirs, and a welcome.
 * Someone already signed in only adds their organizer profile. Nobody reviews it: they can
 * publish straight away.
 */
export function ApplyPage() {
  const session = useSession();
  const signUp = useSignUpOrganizer();
  const sendCode = useStartSignIn();
  const [confirmed, setConfirmed] = useState(false);

  // The account exists from here on, so the last two steps outlive the "already an organizer"
  // check below, which would otherwise send them off to their dashboard mid-flow.
  if (signUp.isSuccess) {
    return (
      <AuthShell>
        {confirmed ? (
          <Welcome />
        ) : (
          <ConfirmEmail
            email={signUp.data.user.email}
            sendCode={sendCode}
            onConfirmed={() => setConfirmed(true)}
          />
        )}
      </AuthShell>
    );
  }
  if (session.status === 'loading') {
    return (
      <AuthShell tab="create">
        <div aria-busy="true" aria-label="Checking your account" className="h-40" />
      </AuthShell>
    );
  }
  if (session.status === 'error') {
    return (
      <AuthShell tab="create">
        <ErrorState onRetry={session.refetch}>Couldn't check your account.</ErrorState>
      </AuthShell>
    );
  }
  if (session.user && !signUp.isPending && !canApplyToHost(session.user)) {
    return <Navigate to="/organizer" replace />;
  }
  return (
    <AuthShell tab={session.user ? undefined : 'create'}>
      <ApplyForm
        user={session.user}
        signUp={signUp}
        // The code goes out as soon as the account exists, ready for the next step.
        onSignUp={(request) =>
          signUp.mutate(request, { onSuccess: ({ user }) => sendCode.mutate(user.email) })
        }
      />
    </AuthShell>
  );
}

function ApplyForm({
  user,
  signUp,
  onSignUp,
}: {
  user: SessionUser | null;
  signUp: SignUp;
  onSignUp: (request: OrganizerSignUpRequest) => void;
}) {
  useDocumentTitle(user ? 'Start hosting' : 'Create your organizer account');
  const applyAsMe = useApplyToHost();
  const apply = user ? applyAsMe : signUp;
  const [attempted, setAttempted] = useState(false);
  const [draft, setDraft] = useState<Draft>({
    email: '',
    password: '',
    contactName: user?.name ?? '',
    organizerName: user?.organizer?.name ?? '',
    city: '',
    payoutMethod: 'mpesa',
  });
  // Never ticked for them: consent has to be something the applicant does.
  const [agreed, setAgreed] = useState<Record<Agreement, boolean>>({
    acceptTerms: false,
    consentToDataProcessing: false,
  });

  const filled = {
    ...draft,
    ...agreed,
    termsVersion: ORGANIZER_TERMS_VERSION,
    privacyVersion: PRIVACY_NOTICE_VERSION,
  };
  const parsed = user
    ? organizerApplicationRequestSchema.safeParse(filled)
    : organizerSignUpRequestSchema.safeParse(filled);
  const errors: Errors = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof Errors;
      errors[field] ??= CHOICE_ERRORS[field] ?? issue.message;
    }
  }
  const shown = attempted ? errors : {};
  const set = (field: keyof Draft) => (ev: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [field]: ev.target.value }));
  const tick = (field: Agreement) => (ev: { target: { checked: boolean } }) =>
    setAgreed((a) => ({ ...a, [field]: ev.target.checked }));

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    setAttempted(true);
    if (!parsed.success) return;
    if (user) applyAsMe.mutate(parsed.data);
    else onSignUp(parsed.data as OrganizerSignUpRequest);
  };

  const handle = draft.organizerName.trim() ? slugify(draft.organizerName) : null;

  return (
    <AuthStep>
      <AuthHeading title={user ? 'Start hosting' : 'Create your organizer account'}>
        It takes about a minute, and you can publish your first event straight away.
        {user && (
          <>
            {' '}
            You're signed in as <strong className="break-all text-fg">{user.email}</strong>.
          </>
        )}
      </AuthHeading>

      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TextField
          label="Your name"
          name="name"
          autoComplete="name"
          value={draft.contactName}
          onChange={set('contactName')}
          error={shown.contactName}
        />
        {!user && (
          <>
            <TextField
              label="Email"
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              placeholder="you@example.com"
              value={draft.email}
              onChange={set('email')}
              error={shown.email}
              hint="You'll sign in with this. We'll email you a code to confirm it's yours."
            />
            <PasswordField
              label="Password"
              name="new-password"
              autoComplete="new-password"
              value={draft.password}
              onChange={set('password')}
              error={shown.password}
              hint={`At least ${PASSWORD_MIN_LENGTH} characters. A few words you'll remember works well.`}
            />
          </>
        )}
        <TextField
          label="Organizer name"
          placeholder="e.g. Sauti Sessions, UoN Writers Guild"
          value={draft.organizerName}
          onChange={set('organizerName')}
          error={shown.organizerName}
          hint={
            handle
              ? `Buyers see this name. Your page will be eventify.co/${handle}`
              : 'The name buyers see on your events: your own, or your brand, society or company.'
          }
        />
        <div className="grid gap-4 min-[420px]:grid-cols-2">
          <SelectField
            label="City"
            value={draft.city}
            onChange={set('city')}
            error={shown.city}
            hint="Sets your currency."
          >
            <option value="">Choose one</option>
            {CITIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </SelectField>
          <SelectField
            label="How should we pay you?"
            value={draft.payoutMethod}
            onChange={set('payoutMethod')}
            error={shown.payoutMethod}
          >
            {Object.entries(PAYOUT_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
        </div>

        {/* Each document opens in its own tab, so reading it doesn't lose what was typed. */}
        <div className="flex flex-col gap-3.5 border-t-2 border-hair pt-4">
          <CheckboxField
            checked={agreed.acceptTerms}
            onChange={tick('acceptTerms')}
            error={shown.acceptTerms}
            label={
              <>
                I have read and agree to the{' '}
                <Link to="/terms" target="_blank" className="font-bold">
                  Organizer Terms
                </Link>
                , including how I may use my buyers' personal data.
              </>
            }
          />
          <CheckboxField
            checked={agreed.consentToDataProcessing}
            onChange={tick('consentToDataProcessing')}
            error={shown.consentToDataProcessing}
            label={
              <>
                I consent to Eventify collecting, using and storing my personal data, including
                outside Kenya, as described in the{' '}
                <Link to="/privacy" target="_blank" className="font-bold">
                  Privacy Notice
                </Link>
                .
              </>
            }
          />
        </div>

        {apply.error && (
          <p
            role="alert"
            className="m-0 rounded-xl bg-danger-soft p-3.5 text-sm font-semibold text-danger"
          >
            {apply.error instanceof ApiError
              ? apply.error.message
              : "Couldn't create your organizer account. Check your connection and try again."}
          </p>
        )}
        <Button type="submit" size="lg" className={AUTH_CTA} disabled={apply.isPending}>
          {apply.isPending ? (
            <>
              <Spinner /> Creating…
            </>
          ) : user ? (
            'Start hosting'
          ) : (
            'Create account'
          )}
        </Button>
      </form>
    </AuthStep>
  );
}

/**
 * Step two for a new account: the code we emailed, which shows the address is theirs. The account
 * already exists and is signed in, so someone whose email is slow can carry on and do this later.
 */
function ConfirmEmail({
  email,
  sendCode,
  onConfirmed,
}: {
  email: string;
  sendCode: SendCode;
  onConfirmed: () => void;
}) {
  useDocumentTitle('Enter the code');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const verify = useVerifySignIn();
  const check = (digits: string) => {
    if (!verify.isPending) verify.mutate({ email, code: digits }, { onSuccess: onConfirmed });
  };

  return (
    <AuthStep>
      <AuthHeading title="Enter the code">
        We sent a 6-digit code to <strong className="break-all text-fg">{email}</strong>. It can
        take a minute to arrive; check your spam folder too.
      </AuthHeading>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code');
          check(code);
        }}
      >
        <OtpBoxes
          label="Code"
          value={code}
          onChange={(digits) => {
            setCode(digits);
            setError(undefined);
            verify.reset();
          }}
          onComplete={check}
          error={error ?? verify.error?.message}
        />
        <Button type="submit" size="lg" className={AUTH_CTA} disabled={verify.isPending}>
          {verify.isPending ? (
            <>
              <Spinner /> Checking…
            </>
          ) : (
            'Verify'
          )}
        </Button>
        <ResendCode email={email} resend={sendCode} />
        <MockCodeHint />
      </form>
      <p className="m-0 border-t-2 border-hair pt-4 text-sm text-muted">
        Your account is already made.{' '}
        <Link to="/organizer" className="font-bold">
          Skip this for now
        </Link>
      </p>
    </AuthStep>
  );
}

/** Step three: they're in. */
function Welcome() {
  useDocumentTitle("You're in");
  return (
    <AuthStep>
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-accent-soft text-accent-text">
          <Check size={30} strokeWidth={3} aria-hidden />
        </span>
        <AuthHeading title="You're in">
          Your organizer account is ready. Publish your first event whenever you like.
        </AuthHeading>
      </div>
      <Link
        to="/organizer"
        className={buttonClass({
          size: 'lg',
          block: true,
          className: `${AUTH_CTA} text-accent-ink hover:text-accent-ink`,
        })}
      >
        Go to my dashboard
      </Link>
    </AuthStep>
  );
}

/** Selects fail the schema with an enum message nobody should read. */
const CHOICE_ERRORS: Errors = {
  email: 'Enter a valid email address.',
  city: 'Choose a city.',
  payoutMethod: 'Choose how we should pay you.',
};
