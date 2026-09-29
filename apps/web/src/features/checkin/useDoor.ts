import {
  applyCheckIn,
  doorListSchema,
  toEatIso,
  type DoorCheckIn,
  type DoorList,
} from '@eventify/shared';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { apiGet, apiPost, isNotFound } from '../../lib/api';

/** How often a door device uploads its check-ins and picks up other doors' (fast in tests). */
export const DOOR_SYNC_MS = import.meta.env.MODE === 'test' ? 200 : 15_000;

/** Everything a door device keeps, so it keeps working with no connection and survives a refresh. */
type Saved = {
  list: DoorList | null;
  /** Check-ins made on this device that the server hasn't confirmed yet. */
  pending: DoorCheckIn[];
  /** "Main Gate", or the volunteer's name. */
  door: string | null;
};

const storageKey = (code: string) => `eventify-door:${code}`;

function load(code: string): Saved {
  try {
    const raw = localStorage.getItem(storageKey(code));
    if (raw) {
      const saved = JSON.parse(raw) as Saved;
      const list = doorListSchema.safeParse(saved.list);
      return {
        list: list.success ? list.data : null,
        pending: saved.pending ?? [],
        door: saved.door,
      };
    }
  } catch {
    // Storage blocked or corrupt: download again.
  }
  return { list: null, pending: [], door: null };
}

function persist(code: string, saved: Saved) {
  try {
    localStorage.setItem(storageKey(code), JSON.stringify(saved));
  } catch {
    // Full or blocked: the device still works for this visit.
  }
}

function subscribeOnline(listener: () => void) {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

export const useOnline = () =>
  useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );

export type DoorStatus = 'loading' | 'ready' | 'invalid' | 'error';

/**
 * A door device for one check-in link: the downloaded guest list, this device's check-ins
 * (applied immediately, uploaded when there's a connection) and regular syncing with other doors.
 */
export function useDoor(code: string) {
  const [saved, setSaved] = useState<Saved>(() => load(code));
  const [status, setStatus] = useState<DoorStatus>(() => (saved.list ? 'ready' : 'loading'));
  const [lastSyncFailed, setLastSyncFailed] = useState(false);
  const online = useOnline();
  const current = useRef(saved);
  const syncing = useRef(false);

  const update = useCallback(
    (fn: (s: Saved) => Saved) => {
      setSaved((prev) => {
        const next = fn(prev);
        current.current = next;
        persist(code, next);
        return next;
      });
    },
    [code],
  );

  const onFailure = useCallback((error: unknown) => {
    if (isNotFound(error)) setStatus('invalid');
    else if (!current.current.list) setStatus('error');
    setLastSyncFailed(true);
  }, []);

  /** Upload pending check-ins and take the merged guest list back. */
  const sync = useCallback(async () => {
    const { door, pending } = current.current;
    if (syncing.current) return;
    syncing.current = true;
    try {
      const list = door
        ? await apiPost(
            `/api/checkin/${encodeURIComponent(code)}/sync`,
            { door, checkIns: pending },
            doorListSchema,
          )
        : await apiGet(`/api/checkin/${encodeURIComponent(code)}`, doorListSchema);
      update((s) => ({ ...s, list, pending: s.pending.filter((p) => !pending.includes(p)) }));
      setStatus('ready');
      setLastSyncFailed(false);
    } catch (error) {
      onFailure(error);
    } finally {
      syncing.current = false;
    }
  }, [code, onFailure, update]);

  useEffect(() => {
    const first = setTimeout(() => void sync(), 0);
    const timer = setInterval(() => void sync(), DOOR_SYNC_MS);
    window.addEventListener('online', sync);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      window.removeEventListener('online', sync);
    };
  }, [sync]);

  const checkIn = useCallback(
    (ticketId: string) => {
      update((s) => ({
        ...s,
        pending: [...s.pending, { ticketId, at: toEatIso(Date.now()), offline: !navigator.onLine }],
      }));
      void sync();
    },
    [sync, update],
  );

  const setDoor = useCallback(
    (door: string | null) => {
      update((s) => ({ ...s, door }));
      if (door) void sync();
    },
    [sync, update],
  );

  // This device's check-ins count straight away, before the server confirms them.
  const guests = useMemo(
    () =>
      saved.pending.reduce(
        (list, p) => applyCheckIn(list, p.ticketId, p.at, saved.door ?? 'This device'),
        saved.list?.guests ?? [],
      ),
    [saved],
  );

  return {
    status,
    list: saved.list,
    guests,
    door: saved.door,
    pendingCount: saved.pending.length,
    online,
    lastSyncFailed,
    checkIn,
    setDoor,
    retry: sync,
  };
}
