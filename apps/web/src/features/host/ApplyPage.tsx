import {
  ABOUT_MAX_LENGTH,
  canApplyToHost,
  CATEGORIES,
  CITIES,
  ORGANIZER_TYPES,
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
import { BackLink } from '../../components/BackLink';
import { ErrorState } from '../../components/PageStates';
import {
  Button,
  Card,
  PasswordField,
  SelectField,
  TextAreaField,
  TextField,
} from '../../components/ui';
import { ApiError } from '../../lib/api';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { loginPath } from '../auth/roles';
import { useApplyToHost, useSession, useSignUpOrganizer } from '../auth/useSession';
import { TermsStep, type Agreement } from './TermsStep';

type Draft = {
  [K in Exclude<keyof OrganizerSignUpRequest, Agreement | `${string}Version`>]: string;
};
type Errors = Partial<Record<keyof Draft | Agreement, string>>;

const PAYOUT_LABEL = { mpesa: 'M-Pesa', bank: 'Bank transfer' } as const;

/**
 * /organizer/apply: become an organizer. A guest makes their account (email and password) and
 * applies on this one page; someone already signed in only fills in the application.
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
  useDocumentTitle(user ? 'Apply to host' : 'Create your organizer account');
  const applyAsMe = useApplyToHost();
  const signUp = useSignUpOrganizer();
  const apply = user ? applyAsMe : signUp;
  const [attempted, setAttempted] = useState(false);
  // The terms come first: nobody enters their details before reading and agreeing.
  const [step, setStep] = useState<'terms' | 'details'>('terms');
  const [draft, setDraft] = useState<Draft>({
    email: '',
    password: '',
    contactName: user?.name ?? '',
    organizerName: user?.organizer?.name ?? '',
    type: '',
    city: '',
    category: '',
    payoutMethod: 'mpesa',
    about: '',
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
          {user ? 'Apply to host' : 'Create your organizer account'}
        </h1>
        <p className="m-0 text-[15px] text-muted">
          We review every organizer before they can publish, usually within one working day.{' '}
          {user ? (
            <>
              You're applying with <strong className="break-all text-fg">{user.email}</strong>.
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

      <p className="m-0 text-xs font-extrabold tracking-[0.08em] text-muted uppercase">
        Step {step === 'terms' ? 1 : 2} of 2 · {step === 'terms' ? 'Terms' : 'Your details'}
      </p>

      {step === 'terms' ? (
        <TermsStep
          agreed={agreed}
          onTick={(field, checked) => setAgreed((a) => ({ ...a, [field]: checked }))}
          onContinue={() => {
            setStep('details');
            window.scrollTo(0, 0);
          }}
        />
      ) : (
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
                  hint="You'll sign in with this, and we'll write to you here about your application."
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
                label="What best describes you?"
                value={draft.type}
                onChange={set('type')}
                error={shown.type}
              >
                <option value="">Choose one</option>
                {ORGANIZER_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </SelectField>
              <SelectField
                label="Events you mostly host"
                value={draft.category}
                onChange={set('category')}
                error={shown.category}
              >
                <option value="">Choose one</option>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </SelectField>
              <SelectField
                label="City"
                value={draft.city}
                onChange={set('city')}
                error={shown.city}
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
            <TextAreaField
              label="Tell us about your events"
              placeholder="What you host, how often, and roughly how many people come."
              maxLength={ABOUT_MAX_LENGTH}
              value={draft.about}
              onChange={set('about')}
              error={shown.about}
              hint="This is only for our team. Links to past events or social pages help us approve you faster."
            />
          </Card>

          <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <Check size={16} strokeWidth={3} className="flex-none text-accent-text" aria-hidden />
            You agreed to the Organizer Terms and gave your data consent.
            <button
              type="button"
              onClick={() => setStep('terms')}
              className="cursor-pointer rounded-md font-bold text-fg underline"
            >
              Review
            </button>
          </p>

          {apply.error && (
            <p
              role="alert"
              className="m-0 rounded-xl bg-danger-soft p-3.5 text-sm font-semibold text-danger"
            >
              {apply.error instanceof ApiError
                ? apply.error.message
                : "Couldn't send your application. Check your connection and try again."}
            </p>
          )}
          <Button type="submit" size="lg" disabled={apply.isPending}>
            {apply.isPending ? 'Sending…' : user ? 'Send application' : 'Create account and apply'}
          </Button>
        </form>
      )}
    </div>
  );
}

/** Selects fail the schema with an enum message nobody should read. */
const CHOICE_ERRORS: Errors = {
  email: 'Enter a valid email address.',
  type: 'Choose what describes you.',
  category: 'Choose the kind of events you host.',
  city: 'Choose a city.',
  payoutMethod: 'Choose how we should pay you.',
};
