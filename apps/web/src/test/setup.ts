import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { resetFollowingForTests } from '../lib/following';
import { resetSavedForTests } from '../lib/saved';
import { server } from '../mocks/node';
import { resetAdmin } from '../mocks/admin';
import { resetAuth } from '../mocks/auth';
import { resetCheckIns } from '../mocks/checkin';
import { resetEvents } from '../mocks/events';
import { resetOrders } from '../mocks/orders';
import { resetOrganizers } from '../mocks/organizers';
import { resetRates } from '../mocks/rates';

// findBy*/waitFor give up after 1s by default; debounced search plus mock latency can exceed that on a busy machine.
configure({ asyncUtilTimeout: 3_000 });

// jsdom has no matchMedia. Default to a query that never matches (a device with no stated theme, so the app is dark); tests override with vi.spyOn.
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
  resetCheckIns();
  resetAdmin();
  resetRates();
  resetAuth();
  resetOrganizers();
  delete document.documentElement.dataset.theme;
});
afterAll(() => server.close());
