import {
  DEFAULT_RATE_BPS,
  formatRate,
  LEGAL_CONTACT,
  ORGANIZER_TERMS_VERSION,
} from '@eventify/shared';
import { Link } from 'react-router';
import { LegalPage, LegalSection } from './LegalPage';

const { company, email } = LEGAL_CONTACT;

/** /terms: what an organizer agrees to when they apply to host. Buyers don't need an account. */
export function TermsPage() {
  return (
    <LegalPage
      title="Organizer Terms"
      version={ORGANIZER_TERMS_VERSION}
      intro={
        <>
          These terms are the agreement between you (the organizer) and {company} when you apply to
          host and sell tickets here. You accept them by ticking the box on the application form.
        </>
      }
    >
      <LegalSection title="1. Your account">
        <ul>
          <li>You must be 18 or older and allowed to act for the organizer you apply as.</li>
          <li>
            You sign in with your email address and a password. Keep the password to yourself and
            your inbox secure: you are responsible for what is done from your account.
          </li>
          <li>The details you give us must be true, and you must keep them up to date.</li>
        </ul>
      </LegalSection>

      <LegalSection title="2. Approval">
        <p>
          We review every organizer before they can publish. We may ask for more information,
          decline an application, or suspend or close an organizer account that breaks these terms,
          misleads buyers or puts them at risk.
        </p>
      </LegalSection>

      <LegalSection title="3. Your events">
        <ul>
          <li>
            You are the organizer and seller of your events. {company} provides the ticketing
            platform and collects payment from buyers on your behalf.
          </li>
          <li>
            Everything on your event page (date, venue, prices, what a ticket includes) must be
            accurate, and you must have the right to use the pictures and text you upload.
          </li>
          <li>
            You are responsible for the event itself: the venue, safety, and any licences, permits
            and taxes that apply to it.
          </li>
          <li>No events that are unlawful, fraudulent or that you do not intend to hold.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Fees and payouts">
        <ul>
          <li>
            Our fee is {formatRate(DEFAULT_RATE_BPS)} of ticket sales unless we have agreed a
            different rate with you in writing. It is taken out of your payout; buyers pay the price
            you set.
          </li>
          <li>
            We pay what you are owed for an event, less our fee, to the M-Pesa number or bank
            account you give us, after the event has ended.
          </li>
          <li>
            We may hold back or delay a payout while we look into suspected fraud, a payment
            dispute, or an event that was cancelled or did not happen as advertised.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Cancellations and refunds">
        <p>
          If you cancel or substantially change an event, you must tell us and your buyers straight
          away, and buyers are entitled to their money back. We may refund buyers from ticket money
          we still hold, and you must repay us any refund we make that your payout does not cover.
        </p>
      </LegalSection>

      <LegalSection title="6. Your buyers' personal data">
        <p>
          To run your event we show you details of the people who bought tickets, such as their
          names and ticket status. This is personal data protected by Kenya's Data Protection Act,
          2019. You agree to:
        </p>
        <ul>
          <li>use it only to run the event the tickets were bought for;</li>
          <li>
            not use it for marketing, and not sell or share it, unless the buyer has given you their
            own clear consent;
          </li>
          <li>
            keep it secure, give access only to people who need it (such as your door staff), and
            delete any copies once you no longer need them for the event;
          </li>
          <li>
            tell us at <a href={`mailto:${email}`}>{email}</a> within 48 hours if it is lost, leaked
            or seen by someone who should not have it, and help us respond to any buyer who asks
            about their data.
          </li>
        </ul>
        <p>
          How we handle your own personal data is set out in our{' '}
          <Link to="/privacy">Privacy Notice</Link>.
        </p>
      </LegalSection>

      <LegalSection title="7. Our responsibility">
        <p>
          We work to keep {company} available and secure but do not promise it will never be
          interrupted. To the extent the law allows, we are not liable for losses we could not
          reasonably have foreseen, or for anything arising from the event itself, and our total
          liability to you for an event is limited to the fees we earned on it. Nothing here limits
          liability that cannot be limited by law.
        </p>
        <p>
          You agree to cover claims made against us that arise from your event or from your breach
          of these terms.
        </p>
      </LegalSection>

      <LegalSection title="8. Changes and ending">
        <ul>
          <li>
            If we change these terms we will tell you by email before the change takes effect and
            ask you to accept the new version.
          </li>
          <li>
            You can stop using {company} at any time by writing to us. Events already on sale, and
            payouts and refunds for them, are still handled under these terms.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="9. Law">
        <p>
          These terms are governed by the laws of Kenya, and the courts of Kenya decide any dispute
          about them. Questions: <a href={`mailto:${email}`}>{email}</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
