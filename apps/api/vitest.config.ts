import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Each test file starts its own in-memory Postgres, which takes a few seconds on a small machine.
    hookTimeout: 60_000,
    testTimeout: 20_000,
    maxWorkers: 1,
  },
});
