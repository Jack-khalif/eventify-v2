import { useEffect, useState } from 'react';

/** Whole seconds since `since`, ticking every second. Counts from the server's timestamp, so a refresh keeps the time. */
export function useElapsedSeconds(since: string | null) {
  const compute = () =>
    since ? Math.max(0, Math.floor((Date.now() - Date.parse(since)) / 1000)) : 0;
  const [seconds, setSeconds] = useState(compute);

  useEffect(() => {
    if (!since) return;
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - Date.parse(since)) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [since]);

  return seconds;
}

export const formatElapsed = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
