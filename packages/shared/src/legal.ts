/**
 * The documents people agree to. Whenever the wording of one changes, give it a new version (the
 * date it takes effect): each acceptance is stored with the version that was on screen, which is
 * our proof of what the person agreed to.
 */
export const ORGANIZER_TERMS_VERSION = '2026-10-09';
export const PRIVACY_NOTICE_VERSION = '2026-10-09';

export type LegalDocument = 'organizer_terms' | 'privacy_notice';

/** Who answers for personal data, as named in the terms and the privacy notice. */
export const LEGAL_CONTACT = {
  company: 'Eventify',
  email: 'privacy@eventify.co',
} as const;
