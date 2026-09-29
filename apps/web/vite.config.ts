import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    // Full user flows (typing a checkout form, waiting on payment) take a few seconds in jsdom.
    testTimeout: 15_000,
    // jsdom workers are heavy; two at a time keeps a 4-core laptop responsive and tests stable.
    maxWorkers: 2,
  },
});
