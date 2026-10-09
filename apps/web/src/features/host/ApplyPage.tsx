import {
  ABOUT_MAX_LENGTH,
  canApplyToHost,
  CATEGORIES,
  CITIES,
  ORGANIZER_TYPES,
  ORGANIZER_TERMS_VERSION,
  organizerApplicationRequestSchema,
  PRIVACY_NOTICE_VERSION,
  slugify,
  type OrganizerApplicationRequest,
  type SessionUser,
} from '@eventify/shared';
import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router';
import { BackLink } from '../../components/BackLink';
import {
  Button,
  Card,
  CheckboxField,
  SelectField,
  TextAreaField,
  TextField,
} from '../../components/ui';
import { ApiError } from '../../lib/api';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { SignedIn } from '../auth/guards';
import { useApplyToHost } from '../auth/useSession';

type Agreement = 'acceptTerms' | 'consentToDataProcessing';
type Draft = {
  [K in Exclude<keyof OrganizerApplicationRequest, Agreement | `${string}Version`>]: string;
};
type Errors = Partial<Record<keyof Draft | Agreement, string>>;

const PAYOUT_LABEL = { mpesa: 'M-Pesa', bank: 'Bank transfer' } as const;

/** /organizer/apply: ask to host. Signing in comes first, so the application has a verified email. */
export function ApplyPage() {
  return (
    <SignedIn>
      {(user) =>
        canApplyToHost(user) ? <ApplyForm user={user} /> : <Navigate to="/organizer" replace />
      }
    </SignedIn>
  );
}

function ApplyForm({ user }: { user: SessionUser }) {
  useDocumentTitle('Apply to host');
  const apply = useApplyToHost();
  const [attempted, setAttempted] = useState(false);
  const [draft, setDraft] = useState<Draft>({
    contactName: user.name,
    organizerName: user.organizer?.name ?? '',
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

  const parsed = organizerApplicationRequestSchema.safeParse({
    ...draft,
    ...agreed,
    termsVersion: ORGANIZER_TERMS_VERSION,
    privacyVersion: PRIVACY_NOTICE_VERSION,
  });
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
    if (parsed.success) apply.mutate(parsed.data);
  };

  const handle = draft.organizerName.trim() ? slugify(draft.organizerName) : null;

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-5 px-5 pt-5 pb-12">
      <BackLink label="Hosting" fallback="/organizer" />
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-[28px] tracking-[-0.02em]">Apply to host</h1>
        <p className="m-0 text-[15px] text-muted">
          We review every organizer before they can publish, usually within one working day. You're
          applying with <strong className="break-all text-fg">{user.email}</strong>.
        </p>
      </div>

      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <Card className="flex flex-col gap-4 p-5">
          <h2 className="m-0 text-base">About you</h2>
          <TextField
            label="Your name"
            autoComplete="name"
            value={draft.contactName}
            onChange={set('contactName')}
            error={shown.contactName}
          />
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
            <SelectField label="City" value={draft.city} onChange={set('city')} error={shown.city}>
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

        <Card className="flex flex-col gap-4 p-5">
          <h2 className="m-0 text-base">Terms and your personal data</h2>
          <div className="flex flex-col gap-2 text-sm text-muted">
            <p className="m-0">
              Under Kenya's Data Protection Act, 2019 we need your consent before we use the details
              on this form. In short:
            </p>
            <ul className="m-0 flex flex-col gap-1 pl-5">
              <li>
                We use your name, email, organizer details and payout method to review this
                application, run your organizer account and pay you.
              </li>
              <li>
                Our team sees them, and so do the companies that host our service, send our emails
                and SMS, and process payments. Buyers see only your public organizer profile.
              </li>
              <li>They are stored on servers outside Kenya (in the European Union).</li>
              <li>
                You can ask for a copy, have them corrected or deleted, or withdraw this consent at
                any time. Without it we can't keep your organizer account open.
              </li>
            </ul>
          </div>
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
              : "Couldn't send your application. Check your connection and try again."}
          </p>
        )}
        <Button type="submit" size="lg" disabled={apply.isPending}>
          {apply.isPending ? 'Sending…' : 'Send application'}
        </Button>
      </form>
    </div>
  );
}

/** Selects fail the schema with an enum message nobody should read. */
const CHOICE_ERRORS: Errors = {
  type: 'Choose what describes you.',
  category: 'Choose the kind of events you host.',
  city: 'Choose a city.',
  payoutMethod: 'Choose how we should pay you.',
};
