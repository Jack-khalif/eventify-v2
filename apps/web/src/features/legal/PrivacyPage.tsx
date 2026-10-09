import { LEGAL_CONTACT, PRIVACY_NOTICE_VERSION } from '@eventify/shared';
import { LegalPage, LegalSection } from './LegalPage';

const { company, email } = LEGAL_CONTACT;

/**
 * /privacy: what personal data we hold and why, written to give the information section 29 of
 * Kenya's Data Protection Act, 2019 requires at the point of collection.
 */
export function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Notice"
      version={PRIVACY_NOTICE_VERSION}
      intro={
        <>
          {company} decides how the personal data described here is used, which makes us the data
          controller under Kenya's Data Protection Act, 2019. This notice explains what we collect,
          why, who sees it and the rights you have.
        </>
      }
    >
      <LegalSection title="1. What we collect">
        <ul>
          <li>
            <strong>Ticket buyers</strong> (no account needed): your name, phone number and email
            address, what you bought, the status of your payment, and when your ticket was scanned
            at the door.
          </li>
          <li>
            <strong>People who sign in</strong>: your email address and a record of your sign-ins.
          </li>
          <li>
            <strong>Organizers</strong>: your name and email address, your organizer name, type,
            city and the kind of events you host, what you tell us about your events, how you want
            to be paid, and your sales and payouts.
          </li>
          <li>
            <strong>Consent records</strong>: when you agree to our terms or give consent, we keep
            the version you agreed to, the date and time, and the internet address and browser you
            used.
          </li>
          <li>
            <strong>Technical data</strong>: your internet address, used briefly to stop abuse such
            as repeated sign-in attempts.
          </li>
        </ul>
        <p>
          We do not ask for sensitive personal data such as your health, religion or ethnic origin.
        </p>
      </LegalSection>

      <LegalSection title="2. Why we use it">
        <ul>
          <li>To sell and deliver tickets and let you in at the door (to perform our contract).</li>
          <li>
            To review organizer applications, run organizer accounts and pay organizers (to perform
            our contract, and with your consent).
          </li>
          <li>To send codes and messages about your tickets or account.</li>
          <li>To prevent fraud and keep the service secure (our legitimate interest).</li>
          <li>To keep the financial records the law requires (a legal obligation).</li>
        </ul>
        <p>We do not sell personal data, and we do not send marketing without separate consent.</p>
      </LegalSection>

      <LegalSection title="3. What you must give us">
        <p>
          The details marked on our forms are needed to issue a ticket or to consider an organizer
          application. You are free not to give them, but then we cannot sell you a ticket or
          approve you as an organizer.
        </p>
      </LegalSection>

      <LegalSection title="4. Who sees it">
        <ul>
          <li>
            <strong>The organizer of an event you bought a ticket for</strong>, and their door
            staff, so they can let you in.
          </li>
          <li>
            <strong>{company} staff</strong> who review organizers, handle payouts and give support.
          </li>
          <li>
            <strong>Companies that work for us</strong>: our hosting and database provider, our
            email and SMS providers, and the payment provider (such as M-Pesa) that takes your
            payment. They may use the data only to provide that service to us.
          </li>
          <li>Authorities, where the law requires it.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Where it is kept">
        <p>
          Our servers and database are in the European Union, and some of our providers handle data
          in other countries outside Kenya. We use providers that commit to protecting personal data
          to a standard comparable to Kenyan law. Organizers are asked to consent to this transfer
          when they apply.
        </p>
      </LegalSection>

      <LegalSection title="6. How long we keep it">
        <ul>
          <li>Sign-in codes: 10 minutes. Sign-in sessions: up to 30 days.</li>
          <li>
            Orders, tickets, payouts and consent records: for as long as the law requires financial
            and consent records to be kept, then deleted or made anonymous.
          </li>
          <li>
            Organizer profiles and applications: while the account is open, and afterwards only as
            long as we need them for the records above.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="7. Your rights">
        <p>Under the Data Protection Act you have the right to:</p>
        <ul>
          <li>be told how your personal data is used (this notice);</li>
          <li>ask for a copy of the personal data we hold about you;</li>
          <li>have data that is wrong or misleading corrected;</li>
          <li>object to, or ask us to limit, how we use your data;</li>
          <li>ask us to delete data we no longer have a reason to keep;</li>
          <li>receive your data in a form you can take elsewhere;</li>
          <li>
            withdraw a consent you gave, at any time. This does not undo what was done before you
            withdrew, and if we need the data to run your organizer account we may have to close it.
          </li>
        </ul>
        <p>
          To use any of these, write to <a href={`mailto:${email}`}>{email}</a>. We will answer
          within the time the law allows. If you are not satisfied you can complain to the Office of
          the Data Protection Commissioner at{' '}
          <a href="https://www.odpc.go.ke" target="_blank" rel="noreferrer">
            odpc.go.ke
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="8. Security">
        <p>
          Connections to {company} are encrypted, sign-in sessions and codes are stored only in
          hashed form, and staff access is limited and logged. If a breach puts your data at real
          risk we will tell you and the Data Protection Commissioner as the law requires.
        </p>
      </LegalSection>

      <LegalSection title="9. Changes">
        <p>
          When this notice changes we publish the new version here with its date, and ask organizers
          to agree to it again where the change affects their consent.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
