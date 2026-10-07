import { useSyncExternalStore } from 'react';

/**
 * The session token from sign-in, kept on this device and sent with every API request. Shared by
 * every component that reads it and kept in sync across tabs, so signing out in one tab signs
 * out the others. If storage is blocked, the session lasts for the visit.
 */
export const SESSION_STORAGE_KEY = 'eventify-session';

const listeners = new Set<() => void>();
let storageBroken = false;
let memory: string | null = null;

export function getSessionToken(): string | null {
  if (storageBroken) return memory;
  try {
    return localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    storageBroken = true;
    return memory;
  }
}

export function setSessionToken(token: string | null) {
  memory = token;
  try {
    if (token) localStorage.setItem(SESSION_STORAGE_KEY, token);
    else localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    storageBroken = true;
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === SESSION_STORAGE_KEY && listener();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export const useSessionToken = () => useSyncExternalStore(subscribe, getSessionToken, () => null);
