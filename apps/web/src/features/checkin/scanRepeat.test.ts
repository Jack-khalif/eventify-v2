import { describe, expect, it } from 'vitest';
import { createScanFilter } from './scanRepeat';

/** Reads every 200ms, as the scanner does. */
const frames = (from: number, to: number) =>
  Array.from({ length: (to - from) / 200 + 1 }, (_, i) => from + i * 200);

describe('createScanFilter', () => {
  it('reports a ticket held up to the camera once, however long it stays', () => {
    const report = createScanFilter();
    const reported = frames(0, 10_000).filter((at) => report('EVT1.a', at, at < 2_500 && at > 0));
    expect(reported).toEqual([0]);
  });

  it('reports it again once it has been taken away and shown again', () => {
    const report = createScanFilter();
    expect(report('EVT1.a', 0, false)).toBe(true);
    expect(report('EVT1.a', 5_000, false)).toBe(true);
  });

  it('reports the next guest straight after the result clears, even if shown during it', () => {
    const report = createScanFilter();
    expect(report('EVT1.a', 0, false)).toBe(true);
    expect(report('EVT1.b', 1_000, true)).toBe(false);
    expect(report('EVT1.b', 2_600, false)).toBe(true);
  });
});
