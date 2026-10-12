import { useEffect, useState } from 'react';

/** Seconds left before a new code may be asked for; `restart` begins the wait again. */
export function useResendWait(seconds = 30) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (left <= 0) return;
    const timer = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [left]);
  return { left, restart: () => setLeft(seconds) };
}
