import { canCreateEvents, isStaff, type SessionUser } from '@eventify/shared';

/**
 * The one link that changes with who you are: staff go to the admin portal, organizers to their
 * dashboard, and everyone else to the page that explains hosting.
 */
export function workLink(user: SessionUser | null): { to: string; label: string } {
  if (user && isStaff(user.role)) return { to: '/admin', label: 'Admin' };
  if (user?.organizer) return { to: '/organizer', label: 'Dashboard' };
  return { to: '/organizer', label: 'Host an event' };
}

/** Where "host/create an event" buttons go: straight to the form only for approved organizers. */
export function hostCta(user: SessionUser | null): { to: string; label: string } {
  return canCreateEvents(user)
    ? { to: '/organizer/events/new', label: 'Create an event' }
    : { to: '/organizer', label: 'Host an event' };
}
