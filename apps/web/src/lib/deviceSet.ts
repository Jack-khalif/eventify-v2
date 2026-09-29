import { useCallback, useSyncExternalStore } from 'react';

/**
 * A set of ids kept on this device (localStorage), shared by every component that reads it and
 * kept in sync across tabs. Used for Saved events and Followed organizers, since attendees have no accounts.
 * If storage is blocked, the set lives in memory for the visit.
 */
export function createDeviceSet(storageKey: string) {
  const listeners = new Set<() => void>();
  let storageBroken = false;
  let memory: string | null = null;
  let lastRaw: string | null | undefined;
  let lastIds: string[] = [];

  function readRaw(): string | null {
    if (storageBroken) return memory;
    try {
      return localStorage.getItem(storageKey);
    } catch {
      storageBroken = true;
      return memory;
    }
  }

  function writeRaw(value: string) {
    memory = value;
    try {
      localStorage.setItem(storageKey, value);
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
    const onStorage = (e: StorageEvent) => e.key === storageKey && listener();
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener('storage', onStorage);
    };
  }

  /** Adds the id (newest first) or removes it if already present. */
  function toggle(id: string) {
    const ids = getSnapshot();
    writeRaw(JSON.stringify(ids.includes(id) ? ids.filter((x) => x !== id) : [id, ...ids]));
  }

  function reset() {
    storageBroken = false;
    memory = null;
    lastRaw = undefined;
    lastIds = [];
  }

  function useSet() {
    const ids = useSyncExternalStore(subscribe, getSnapshot, () => lastIds);
    const has = useCallback((id: string) => ids.includes(id), [ids]);
    return { ids, has, toggle };
  }

  return { storageKey, toggle, reset, useSet };
}
