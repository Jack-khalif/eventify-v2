import type { Role } from './enums';
import type { SessionUser } from './schemas';

/**
 * Who may do what, shared by the web app's route guards and the API. The web checks are for
 * showing the right screen; the API must enforce the same rules on every request.
 */

type MaybeUser = SessionUser | null | undefined;

export const isStaff = (role: Role) => role === 'agent' || role === 'super_admin';

/** Only organizers a Super Admin has approved can publish events. */
export const canCreateEvents = (user: MaybeUser) =>
  user?.role === 'organizer' && user.organizer?.status === 'active';

/** Attendees can apply; a declined organizer can fix their details and apply again. */
export const canApplyToHost = (user: MaybeUser) =>
  user?.role === 'attendee' ||
  (user?.role === 'organizer' && user.organizer?.status === 'rejected');

/** Where someone lands after signing in. */
export function homePathFor(user: SessionUser): string {
  if (isStaff(user.role)) return '/admin';
  return user.role === 'organizer' ? '/organizer' : '/account';
}

/**
 * The `next` a sign-in link asked for, if it is a path on this site. Anything else (another
 * origin, "//host", a scheme) is dropped so a crafted link can't bounce people elsewhere.
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return null;
  return next;
}

/** Paths the app owns, which an organizer handle (eventify.co/{handle}) must not shadow. */
export const RESERVED_HANDLES: readonly string[] = [
  'account',
  'admin',
  'api',
  'checkin',
  'dev',
  'e',
  'login',
  'organizer',
  'privacy',
  'saved',
  't',
  'terms',
  'tickets',
];
