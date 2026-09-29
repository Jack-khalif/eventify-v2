import { createDeviceSet } from './deviceSet';

/** Saved events: event ids, newest first. */
const saved = createDeviceSet('eventify-saved');

export const SAVED_STORAGE_KEY = saved.storageKey;
export const toggleSaved = saved.toggle;
export const resetSavedForTests = saved.reset;

export function useSavedEvents() {
  const { ids, has, toggle } = saved.useSet();
  return { ids, isSaved: has, toggle };
}
