import { useCallback, useSyncExternalStore } from 'react';

/**
 * Saved events live on this device only (no accounts for attendees).
 * Stored as a JSON array of event ids. If storage is blocked we keep them in memory for the visit.
 */
export const SAVED_STORAGE_KEY = 'eventify-saved';

const listeners = new Set<() => void>();
let storageBroken = false;
let memory: string | null = null;

function readRaw(): string | null {
  if (storageBroken) return memory;
  try {
    return localStorage.getItem(SAVED_STORAGE_KEY);
  } catch {
    storageBroken = true;
    return memory;
  }
}

function writeRaw(value: string) {
  memory = value;
  try {
    localStorage.setItem(SAVED_STORAGE_KEY, value);
  } catch {
    storageBroken = true;
  }
  listeners.forEach((l) => l());
}

function parse(raw: string | null): string[] {
  try {
    const value: unknown = JSON.parse(raw ?? '[]');
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

// useSyncExternalStore needs the same array back until the stored value actually changes.
let lastRaw: string | null | undefined;
let lastIds: string[] = [];
function getSnapshot() {
  const raw = readRaw();
  if (raw !== lastRaw) {
    lastRaw = raw;
    lastIds = parse(raw);
  }
  return lastIds;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Keep other tabs in sync.
  const onStorage = (e: StorageEvent) => e.key === SAVED_STORAGE_KEY && listener();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function toggleSaved(eventId: string) {
  const ids = getSnapshot();
  const next = ids.includes(eventId) ? ids.filter((id) => id !== eventId) : [eventId, ...ids];
  writeRaw(JSON.stringify(next));
}

/** Test helper: forget in-memory state between tests. */
export function resetSavedForTests() {
  storageBroken = false;
  memory = null;
  lastRaw = undefined;
  lastIds = [];
}

export function useSavedEvents() {
  const ids = useSyncExternalStore(subscribe, getSnapshot, () => lastIds);
  const isSaved = useCallback((eventId: string) => ids.includes(eventId), [ids]);
  return { ids, isSaved, toggle: toggleSaved };
}
