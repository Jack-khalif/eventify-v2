import type { OrganizerStatus, SessionUser } from '@eventify/shared';
import type { TagTone } from '../../components/ui/Tag';

/** How each kind of account is named in the header and on the profile. */
export function roleBadge(user: SessionUser): { label: string; tone: TagTone } {
  if (user.role === 'super_admin') return { label: 'Super Admin', tone: 'accent' };
  if (user.role === 'agent') return { label: 'Agent', tone: 'accent' };
  if (user.role === 'organizer' && user.organizer) return ORGANIZER_BADGE[user.organizer.status];
  return { label: 'Attendee', tone: 'neutral' };
}

const ORGANIZER_BADGE: Record<OrganizerStatus, { label: string; tone: TagTone }> = {
  active: { label: 'Organizer', tone: 'accent' },
  pending: { label: 'Organizer · in review', tone: 'outline' },
  suspended: { label: 'Organizer · suspended', tone: 'danger' },
  rejected: { label: 'Application declined', tone: 'neutral' },
};

/** A link to sign-in that comes back to `next` afterwards. */
export const loginPath = (next: string, intent?: 'host') =>
  `/login?next=${encodeURIComponent(next)}${intent ? `&intent=${intent}` : ''}`;
