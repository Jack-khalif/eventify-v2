import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Button, Card, CheckboxField } from '../../components/ui';
import { TermsBody } from '../legal/TermsPage';

export type Agreement = 'acceptTerms' | 'consentToDataProcessing';

/**
 * The first step of becoming an organizer: the terms to read, and the consent the Data Protection
 * Act asks for, each with its own tick. Nothing is ticked for them, the terms box can only be
 * ticked once the terms have been scrolled to the end, and the button stays off until both are.
 */
export function TermsStep({
  agreed,
  onTick,
  onContinue,
}: {
  agreed: Record<Agreement, boolean>;
  onTick: (field: Agreement, checked: boolean) => void;
  onContinue: () => void;
}) {
  const terms = useRef<HTMLDivElement>(null);
  const [readToEnd, setReadToEnd] = useState(agreed.acceptTerms);
  const agreedToBoth = agreed.acceptTerms && agreed.consentToDataProcessing;

  const checkEnd = () => {
    const box = terms.current;
    if (box && box.scrollTop + box.clientHeight >= box.scrollHeight - 24) setReadToEnd(true);
  };
  // Terms short enough to fit need no scrolling.
  useEffect(checkEnd, []);

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    if (agreedToBoth) onContinue();
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="m-0 text-base">Organizer Terms</h2>
          <Link to="/terms" target="_blank" className="text-sm font-bold">
            Open in a new tab
          </Link>
        </div>
        <div
          ref={terms}
          onScroll={checkEnd}
          tabIndex={0}
          role="region"
          aria-label="Organizer Terms"
          className="flex max-h-[45dvh] flex-col gap-5 overflow-y-auto rounded-lg border-2 border-hair bg-surface p-4"
        >
          <TermsBody />
        </div>
        <CheckboxField
          checked={agreed.acceptTerms}
          disabled={!readToEnd}
          onChange={(ev) => onTick('acceptTerms', ev.target.checked)}
          label={
            <>
              I have read and agree to the Organizer Terms, including how I may use my buyers'
              personal data.
              {!readToEnd && (
                <span className="block text-xs text-muted">
                  Scroll to the end of the terms to tick this.
                </span>
              )}
            </>
          }
        />
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="m-0 text-base">Your personal data</h2>
        <div className="flex flex-col gap-2 text-sm text-muted">
          <p className="m-0">
            Under Kenya's Data Protection Act, 2019 we need your consent before we use the details
            you give us next. In short:
          </p>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
            <li>
              We use your name, email, organizer details and payout method to review your
              application, run your organizer account and pay you.
            </li>
            <li>
              Our team sees them, and so do the companies that host our service, send our emails and
              SMS, and process payments. Buyers see only your public organizer profile.
            </li>
            <li>They are stored on servers outside Kenya (in the European Union).</li>
            <li>
              You can ask for a copy, have them corrected or deleted, or withdraw this consent at
              any time. Without it we can't keep your organizer account open.
            </li>
          </ul>
        </div>
        <CheckboxField
          checked={agreed.consentToDataProcessing}
          onChange={(ev) => onTick('consentToDataProcessing', ev.target.checked)}
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

      <div className="flex flex-col gap-2">
        <Button
          type="submit"
          size="lg"
          disabled={!agreedToBoth}
          aria-describedby={agreedToBoth ? undefined : 'terms-step-hint'}
        >
          Agree and continue
        </Button>
        {!agreedToBoth && (
          <p id="terms-step-hint" className="m-0 text-center text-xs text-muted">
            Tick both boxes above to continue.
          </p>
        )}
      </div>
    </form>
  );
}
