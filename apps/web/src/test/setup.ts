import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { resetFollowingForTests } from '../lib/following';
import { resetSavedForTests } from '../lib/saved';
import { server } from '../mocks/node';
import { resetEvents } from '../mocks/events';
import { resetOrders } from '../mocks/orders';

// findBy*/waitFor give up after 1s by default; debounced search plus mock latency can exceed that on a busy machine.
configure({ asyncUtilTimeout: 3_000 });

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
  resetFollowingForTests();
  resetOrders();
  resetEvents();
  delete document.documentElement.dataset.theme;
});
afterAll(() => server.close());
