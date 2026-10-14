/**
 * A QR held in front of the camera is reported once, however long it stays there. It is reported
 * again only after it has been out of view this long (shown again, it then reads "Already used").
 */
export const REPEAT_AFTER_MS = 2_000;

/**
 * Decides which camera reads become scans. Feed it every frame's read, including while a result is
 * on screen (`paused`), so it knows what is still in view.
 */
export function createScanFilter() {
  let seen = { text: '', at: 0 };
  let reported = '';
  return (text: string, now: number, paused: boolean): boolean => {
    const lastSeenAt = seen.text === text ? seen.at : 0;
    seen = { text, at: now };
    if (paused || (text === reported && now - lastSeenAt <= REPEAT_AFTER_MS)) return false;
    reported = text;
    return true;
  };
}
