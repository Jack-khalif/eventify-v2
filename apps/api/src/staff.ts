import type { AddStaffRequest, AdminMe, StaffRow } from '@eventify/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import type { AdminError } from './admin';
import { endAllSessions } from './auth';
import type { Db } from './db/client';
import { accounts, agents, organizers, sessions } from './db/schema';

/** Who can open the admin portal, and who looks after which organizer. Super Admin only. */

const forbidden: AdminError = {
  status: 403,
  error: 'forbidden',
  message: "You don't have access to that.",
};
const notFound: AdminError = { status: 404, error: 'not_found', message: 'Not found' };

export async function staffRows(db: Db): Promise<StaffRow[]> {
  const staff = await db
    .select()
    .from(accounts)
    .where(inArray(accounts.role, ['agent', 'super_admin']))
    .orderBy(asc(accounts.role), asc(accounts.email));
  const orgs = await db.select({ agentId: organizers.agentId }).from(organizers);
  return staff.map((a) => ({
    id: a.id,
    email: a.email,
    name: a.name,
    role: a.role as StaffRow['role'],
    agentId: a.agentId,
    twoStep: !!a.totpEnabledAt,
    organizers: a.agentId ? orgs.filter((o) => o.agentId === a.agentId).length : 0,
  }));
}

/**
 * Give someone staff access. They sign in with this email like anyone else; the account is made
 * now if they have never signed in. Organizers can't also be staff: one account, one role.
 */
export async function addStaff(
  db: Db,
  me: AdminMe,
  req: AddStaffRequest,
): Promise<StaffRow | AdminError> {
  if (me.role !== 'super_admin') return forbidden;
  const id = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(accounts)
      .where(eq(accounts.email, req.email))
      .for('update');
    if (existing?.role === 'organizer') {
      return {
        status: 409,
        error: 'is_organizer',
        message: 'That email belongs to an organizer. Staff need a separate email address.',
      } as const;
    }
    if (existing && existing.role !== 'attendee') {
      return {
        status: 409,
        error: 'already_staff',
        message: 'That person already has staff access.',
      } as const;
    }
    let agentId: string | null = null;
    if (req.role === 'agent') {
      agentId = `agent_${randomBytes(5).toString('hex')}`;
      await tx.insert(agents).values({ id: agentId, name: req.name });
    }
    // Staff sign in with the emailed code only. If this address already had an account, nobody
    // has shown it belongs to the person being added, so its password and open sign-ins go.
    const values = { name: req.name, role: req.role, agentId, passwordHash: null };
    if (existing) await tx.delete(sessions).where(eq(sessions.accountId, existing.id));
    const accountId = existing?.id ?? `acc_${randomBytes(8).toString('hex')}`;
    await tx
      .insert(accounts)
      .values({ id: accountId, email: req.email, ...values })
      .onConflictDoUpdate({ target: accounts.id, set: values });
    return accountId;
  });
  if (typeof id !== 'string') return id;
  return (await staffRows(db)).find((s) => s.id === id)!;
}

/**
 * Take staff access away and sign them out everywhere. An agent's organizers keep their history
 * but are left with nobody looking after them until a Super Admin assigns someone else.
 */
export async function removeStaff(
  db: Db,
  me: AdminMe,
  myAccountId: string,
  accountId: string,
  superAdminEmails: readonly string[],
): Promise<{ ok: true } | AdminError> {
  if (me.role !== 'super_admin') return forbidden;
  if (accountId === myAccountId) {
    return { status: 409, error: 'is_you', message: 'You can’t remove your own access.' };
  }
  return db.transaction(async (tx) => {
    const [account] = await tx
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, accountId), inArray(accounts.role, ['agent', 'super_admin'])))
      .for('update');
    if (!account) return notFound;
    if (superAdminEmails.includes(account.email)) {
      return {
        status: 409,
        error: 'in_settings',
        message:
          'This Super Admin is named in the server settings (SUPER_ADMIN_EMAILS) and has to be removed there.',
      } as const;
    }
    if (account.agentId) {
      await tx
        .update(organizers)
        .set({ agentId: null })
        .where(eq(organizers.agentId, account.agentId));
    }
    await tx
      .update(accounts)
      .set({ role: 'attendee', agentId: null })
      .where(eq(accounts.id, account.id));
    await endAllSessions(tx, account.id);
    return { ok: true } as const;
  });
}

/** Say which agent looks after an organizer (null = nobody). */
export async function assignAgent(
  db: Db,
  me: AdminMe,
  handle: string,
  agentId: string | null,
): Promise<{ ok: true } | AdminError> {
  if (me.role !== 'super_admin') return forbidden;
  if (agentId) {
    // Only someone who can still sign in as that agent.
    const [agent] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.agentId, agentId), eq(accounts.role, 'agent')));
    if (!agent) return { status: 422, error: 'unknown_agent', message: 'Pick one of the agents.' };
  }
  const [updated] = await db
    .update(organizers)
    .set({ agentId })
    .where(eq(organizers.handle, handle))
    .returning({ id: organizers.id });
  return updated ? { ok: true } : notFound;
}
