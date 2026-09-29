import { liveCode, LIVE_CODE_STEP_MS, liveCodeStep } from '@eventify/shared';
import { useEffect, useRef, useState } from 'react';

/**
 * The pass's rotating code, recomputed whenever the 4-second window changes.
 * Also returns how far through the current window we are (0–1) for the progress bar.
 */
export function useLiveCode(secret: string) {
  const [code, setCode] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const step = useRef(-1);

  useEffect(() => {
    let cancelled = false;
    step.current = -1;
    const tick = async () => {
      const now = Date.now();
      setProgress((now % LIVE_CODE_STEP_MS) / LIVE_CODE_STEP_MS);
      const current = liveCodeStep(now);
      if (current === step.current) return;
      step.current = current;
      const next = await liveCode(secret, now);
      if (!cancelled) setCode(next);
    };
    void tick();
    const id = setInterval(tick, 250);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [secret]);

  return { code, progress };
}
