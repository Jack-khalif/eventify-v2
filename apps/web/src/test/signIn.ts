import { accounts } from '@eventify/shared/fixtures';
import { SESSION_STORAGE_KEY } from '../lib/session';
import { startSession } from '../mocks/auth';

const SAMPLE = {
  organizer: 'acc_amani',
  pendingOrganizer: 'acc_mizizi',
  suspendedOrganizer: 'acc_lens',
  agent: 'acc_grace',
  superAdmin: 'acc_admin',
} as const;

/** Sign in as one of the sample accounts before rendering, skipping the email-and-code form. */
export function signInAs(who: keyof typeof SAMPLE) {
  const account = accounts.find((a) => a.id === SAMPLE[who])!;
  localStorage.setItem(SESSION_STORAGE_KEY, startSession(account.id));
  return account;
}
