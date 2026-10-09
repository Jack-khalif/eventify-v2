import {
  canApplyToHost,
  type Account,
  type AddStaffRequest,
  type StaffRow,
  type OrganizerApplicationRequest,
  type OrganizerSignUpRequest,
  type Session,
  type SessionUser,
} from '@eventify/shared';
import { accounts as sampleAccounts } from '@eventify/shared/fixtures';
import { allOrganizers, findOrganizer, setOrganizerAgent, submitApplication } from './organizers';
import { TEST_LOOKUP_CODE, TEST_PASSWORD } from './testPhones';

/**
 * In-browser stand-in for sign-in until the backend exists. A session is a random token the web
 * app sends as `Authorization: Bearer …`; accounts created here and open sessions are kept in
 * localStorage so a refresh keeps you signed in. The real API emails the code.
 */

type Db = {
  /** Accounts made in this browser, plus sample accounts whose role has since changed. */
  accounts: Account[];
  /** token → account id */
  sessions: Record<string, string>;
  /** account id → password, for accounts signed up in this browser. It's a mock: nothing is hashed. */
  passwords?: Record<string, string>;
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
    email: account.email,
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

/** Null when the code is wrong. An email we haven't seen gets a new attendee account. */
export function verifySignIn(email: string, code: string): Session | null {
  if (code !== TEST_LOOKUP_CODE) return null;
  let account = allAccounts().find((a) => a.email === email);
  if (!account) {
    account = {
      id: `acc_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`,
      name: '',
      email,
      role: 'attendee',
      organizerId: null,
      agentId: null,
    };
    store(account);
  }
  return { token: startSession(account.id), user: sessionUser(account) };
}

/** Null when the email or password is wrong, or the account is staff (they use the code). */
export function signInWithPassword(email: string, password: string): Session | null {
  const account = allAccounts().find((a) => a.email === email);
  if (!account || account.role === 'agent' || account.role === 'super_admin') return null;
  const expected =
    db.passwords?.[account.id] ??
    (sampleAccounts.some((s) => s.id === account.id) && TEST_PASSWORD);
  if (password !== expected) return null;
  return { token: startSession(account.id), user: sessionUser(account) };
}

/** A new account and its application in one go. Null when the email already has an account. */
export function signUpOrganizer({
  email,
  password,
  ...application
}: OrganizerSignUpRequest): Session | null {
  if (allAccounts().some((a) => a.email === email)) return null;
  const account: Account = {
    id: `acc_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`,
    name: '',
    email,
    role: 'attendee',
    organizerId: null,
    agentId: null,
  };
  store(account);
  db.passwords = { ...db.passwords, [account.id]: password };
  const user = applyToHost(account, application)!;
  return { token: startSession(account.id), user };
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
  const organizer = submitApplication(req, account.email, account.organizerId);
  const updated: Account = {
    ...account,
    name: req.contactName,
    role: 'organizer',
    organizerId: organizer.id,
  };
  store(updated);
  return sessionUser(updated);
}

// ── Staff (admin portal) ────────────────────────────────────────────────────

/** Accounts that have "turned on" two-step sign-in. The mock never asks for the second code. */
const twoStep = new Set<string>();
export const hasTwoStep = (accountId: string) => twoStep.has(accountId);
export function setTwoStep(accountId: string, enabled: boolean) {
  if (enabled) twoStep.add(accountId);
  else twoStep.delete(accountId);
}

const toStaffRow = (a: Account): StaffRow => ({
  id: a.id,
  email: a.email,
  name: a.name,
  role: a.role as StaffRow['role'],
  agentId: a.agentId,
  twoStep: twoStep.has(a.id),
  organizers: a.agentId ? allOrganizers().filter((o) => o.agentId === a.agentId).length : 0,
});

export const staffRows = (): StaffRow[] =>
  allAccounts()
    .filter((a) => a.role === 'agent' || a.role === 'super_admin')
    .sort((a, b) => a.role.localeCompare(b.role) || a.email.localeCompare(b.email))
    .map(toStaffRow);

/** The new row, or why not. */
export function addStaff(req: AddStaffRequest): StaffRow | 'is_organizer' | 'already_staff' {
  const existing = allAccounts().find((a) => a.email === req.email);
  if (existing?.role === 'organizer') return 'is_organizer';
  if (existing && existing.role !== 'attendee') return 'already_staff';
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  const account: Account = {
    id: existing?.id ?? `acc_${id}`,
    name: req.name,
    email: req.email,
    role: req.role,
    organizerId: null,
    agentId: req.role === 'agent' ? `agent_${id}` : null,
  };
  store(account);
  return toStaffRow(account);
}

export function removeStaff(accountId: string): boolean {
  const account = allAccounts().find(
    (a) => a.id === accountId && (a.role === 'agent' || a.role === 'super_admin'),
  );
  if (!account) return false;
  for (const o of allOrganizers()) {
    if (account.agentId && o.agentId === account.agentId) setOrganizerAgent(o.id, null);
  }
  store({ ...account, role: 'attendee', agentId: null });
  for (const [token, id] of Object.entries(db.sessions)) {
    if (id === accountId) delete db.sessions[token];
  }
  save();
  return true;
}
