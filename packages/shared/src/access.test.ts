import { describe, expect, it } from 'vitest';
import { canApplyToHost, canCreateEvents, homePathFor, isStaff, safeNextPath } from './access';
import { canMoveOrganizerStatus } from './adminRules';
import type { OrganizerStatus, Role } from './enums';
import type { SessionUser } from './schemas';

const user = (role: Role, status?: OrganizerStatus): SessionUser => ({
  id: 'acc_1',
  name: 'Test',
  email: 'test@example.com',
  role,
  organizer: status ? { id: 'org_1', handle: 'test', name: 'Test', status } : null,
});

describe('access rules', () => {
  it('lets only approved organizers create events', () => {
    expect(canCreateEvents(user('organizer', 'active'))).toBe(true);
    for (const status of ['pending', 'suspended', 'rejected'] as const) {
      expect(canCreateEvents(user('organizer', status))).toBe(false);
    }
    expect(canCreateEvents(user('attendee'))).toBe(false);
    expect(canCreateEvents(user('super_admin'))).toBe(false);
    expect(canCreateEvents(null)).toBe(false);
  });

  it('lets attendees and declined organizers apply', () => {
    expect(canApplyToHost(user('attendee'))).toBe(true);
    expect(canApplyToHost(user('organizer', 'rejected'))).toBe(true);
    expect(canApplyToHost(user('organizer', 'pending'))).toBe(false);
    expect(canApplyToHost(user('agent'))).toBe(false);
    expect(canApplyToHost(null)).toBe(false);
  });

  it('knows staff and where each role lands', () => {
    expect(isStaff('agent')).toBe(true);
    expect(isStaff('organizer')).toBe(false);
    expect(homePathFor(user('super_admin'))).toBe('/admin');
    expect(homePathFor(user('organizer', 'pending'))).toBe('/organizer');
    expect(homePathFor(user('attendee'))).toBe('/account');
  });

  it('only follows next paths on this site', () => {
    expect(safeNextPath('/organizer/events/new')).toBe('/organizer/events/new');
    expect(safeNextPath('//evil.example')).toBeNull();
    expect(safeNextPath('https://evil.example')).toBeNull();
    expect(safeNextPath('/\\evil.example')).toBeNull();
    expect(safeNextPath(null)).toBeNull();
  });

  it('limits organizer status moves', () => {
    expect(canMoveOrganizerStatus('pending', 'active')).toBe(true);
    expect(canMoveOrganizerStatus('pending', 'suspended')).toBe(false);
    expect(canMoveOrganizerStatus('active', 'suspended')).toBe(true);
    expect(canMoveOrganizerStatus('active', 'rejected')).toBe(false);
    expect(canMoveOrganizerStatus('suspended', 'active')).toBe(true);
  });
});
