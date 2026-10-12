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
import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router';
import { BackLink } from '../../components/BackLink';
import { ErrorState } from '../../components/PageStates';
import {
  Button,
  Card,
  CheckboxField,
  PasswordField,
  SelectField,
  TextField,
} from '../../components/ui';
import { ApiError } from '../../lib/api';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { loginPath } from '../auth/roles';
import { useApplyToHost, useSession, useSignUpOrganizer } from '../auth/useSession';
type Agreement = 'acceptTerms' | 'consentToDataProcessing';
/** What the form asks. What describes them and what they host is left out: the API has defaults. */
type Draft = Record<
  'email' | 'password' | 'contactName' | 'organizerName' | 'city' | 'payoutMethod',
  string
>;
type Errors = Partial<Record<keyof Draft | Agreement, string>>;

const PAYOUT_LABEL = { mpesa: 'M-Pesa', bank: 'Bank transfer' } as const;

/**
 * /organizer/apply: become an organizer, on one page. A guest makes their account (email and
 * password) here too; someone already signed in only adds their organizer profile. Nobody reviews
 * it: they land on their dashboard, ready to publish.
 */
export function ApplyPage() {
  const session = useSession();
  if (session.status === 'loading') {
    return <div aria-busy="true" aria-label="Checking your account" className="flex-1" />;
  }
  if (session.status === 'error') {
    return <ErrorState onRetry={session.refetch}>Couldn't check your account.</ErrorState>;
  }
  if (session.user && !canApplyToHost(session.user)) return <Navigate to="/organizer" replace />;
  return <ApplyForm user={session.user} />;
}

function ApplyForm({ user }: { user: SessionUser | null }) {
  useDocumentTitle(user ? 'Start hosting' : 'Create your organizer account');
  const applyAsMe = useApplyToHost();
  const signUp = useSignUpOrganizer();
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
    else signUp.mutate(parsed.data as OrganizerSignUpRequest);
  };

  const handle = draft.organizerName.trim() ? slugify(draft.organizerName) : null;

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-5 px-5 pt-5 pb-12">
      <BackLink label="Hosting" fallback="/organizer" />
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-[28px] tracking-[-0.02em] text-balance">
          {user ? 'Start hosting' : 'Create your organizer account'}
        </h1>
        <p className="m-0 text-[15px] text-muted">
          It takes about a minute, and you can publish your first event straight away.{' '}
          {user ? (
            <>
              You're signed in as <strong className="break-all text-fg">{user.email}</strong>.
            </>
          ) : (
            <>
              Already have an account?{' '}
              <Link to={loginPath('/organizer')} className="font-bold">
                Sign in
              </Link>
            </>
          )}
        </p>
      </div>

      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <Card className="flex flex-col gap-4 p-5">
          <h2 className="m-0 text-base">{user ? 'About you' : 'Your account'}</h2>
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
                hint="You'll sign in with this, and we'll write to you here about your account."
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
        </Card>

        <Card className="flex flex-col gap-4 p-5">
          <h2 className="m-0 text-base">Your organizer profile</h2>
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
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="City"
              value={draft.city}
              onChange={set('city')}
              error={shown.city}
              hint="Sets the currency you sell and are paid in."
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
        </Card>

        <Card className="flex flex-col gap-4 p-5">
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
        </Card>

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
        <Button type="submit" size="lg" disabled={apply.isPending}>
          {apply.isPending ? 'Creating…' : user ? 'Start hosting' : 'Create account'}
        </Button>
      </form>
    </div>
  );
}

/** Selects fail the schema with an enum message nobody should read. */
const CHOICE_ERRORS: Errors = {
  email: 'Enter a valid email address.',
  city: 'Choose a city.',
  payoutMethod: 'Choose how we should pay you.',
};
