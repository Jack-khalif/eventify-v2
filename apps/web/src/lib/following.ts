import { createDeviceSet } from './deviceSet';

/**
 * Followed organizers, by handle. Device-only for now; once attendees can opt in to SMS/email
 * updates (Phase D) this becomes the list we notify about new events.
 */
const following = createDeviceSet('eventify-following');

export const FOLLOWING_STORAGE_KEY = following.storageKey;
export const resetFollowingForTests = following.reset;

export function useFollowing() {
  const { has, toggle } = following.useSet();
  return { isFollowing: has, toggle };
}
