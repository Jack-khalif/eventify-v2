import {
  canApplyToHost,
  type Account,
  type OrganizerApplicationRequest,
  type Session,
  type SessionUser,
} from '@eventify/shared';
import { accounts as sampleAccounts } from '@eventify/shared/fixtures';
import { findOrganizer, submitApplication } from './organizers';
import { TEST_LOOKUP_CODE } from './testPhones';

/**
 * In-browser stand-in for sign-in until the backend exists. A session is a random token the web
 * app sends as `Authorization: Bearer …`; accounts created here and open sessions are kept in
 * localStorage so a refresh keeps you signed in. The real API sends the code by SMS (Phase B).
 */

type Db = {
  /** Accounts made in this browser, plus sample accounts whose role has since changed. */
  accounts: Account[];
  /** token → account id */
  sessions: Record<string, string>;
};

const STORAGE_KEY = 'eventify-mock-accounts';
let db: Db = load();

function initial(): Db {
  return { accounts: [], sessions: {} };
}

function load(): Db {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Db;
  } catch {
    // Storage blocked or corrupt: only the sample accounts exist.
  }
  return initial();
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Not persisted; fine for a mock.
  }
}

export function resetAuth() {
  db = initial();
}

const allAccounts = (): Account[] => [
  ...db.accounts,
  ...sampleAccounts.filter((s) => !db.accounts.some((a) => a.id === s.id)),
];

function store(account: Account) {
  db.accounts = [...db.accounts.filter((a) => a.id !== account.id), account];
  save();
}

export function sessionUser(account: Account): SessionUser {
  const o = account.organizerId ? findOrganizer(account.organizerId) : undefined;
  return {
    id: account.id,
    name: account.name,
    phone: account.phone,
    role: account.role,
    organizer: o ? { id: o.id, handle: o.handle, name: o.name, status: o.status } : null,
  };
}

/** Open a session for an account. Also how tests sign in without going through the form. */
export function startSession(accountId: string): string {
  const token = `mock_${crypto.randomUUID().replace(/-/g, '')}`;
  db.sessions[token] = accountId;
  save();
  return token;
}

/** Null when the code is wrong. A phone we haven't seen gets a new attendee account. */
export function verifySignIn(phone: string, code: string): Session | null {
  if (code !== TEST_LOOKUP_CODE) return null;
  let account = allAccounts().find((a) => a.phone === phone);
  if (!account) {
    account = {
      id: `acc_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`,
      name: '',
      phone,
      role: 'attendee',
      organizerId: null,
      agentId: null,
    };
    store(account);
  }
  return { token: startSession(account.id), user: sessionUser(account) };
}

export function accountForToken(token: string): Account | null {
  const id = db.sessions[token];
  return (id && allAccounts().find((a) => a.id === id)) || null;
}

export function endSession(token: string) {
  delete db.sessions[token];
  save();
}

/** Null when this account can't apply (already an organizer in good standing, or staff). */
export function applyToHost(
  account: Account,
  req: OrganizerApplicationRequest,
): SessionUser | null {
  if (!canApplyToHost(sessionUser(account))) return null;
  const organizer = submitApplication(req, account.phone, account.organizerId);
  const updated: Account = {
    ...account,
    name: req.contactName,
    role: 'organizer',
    organizerId: organizer.id,
  };
  store(updated);
  return sessionUser(updated);
}
