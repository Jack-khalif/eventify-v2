import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '../app/routes';
import { ThemeProvider } from '../app/ThemeProvider';

/** Render the real route tree at a URL, as a user landing on that link would see it. */
export function renderApp(url = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [url] });
  return {
    router,
    ...render(
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>,
    ),
  };
}
