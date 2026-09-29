import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { resetSavedForTests } from '../lib/saved';
import { server } from '../mocks/node';

// jsdom has no matchMedia. Default to a light-mode, non-matching query; tests override with vi.spyOn.
window.matchMedia = (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList;

// The mock API answers every /api request; anything else is a test bug.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  localStorage.clear();
  resetSavedForTests();
  delete document.documentElement.dataset.theme;
});
afterAll(() => server.close());
