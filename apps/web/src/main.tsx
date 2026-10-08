import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { Providers } from './app/Providers';
import { createQueryClient } from './app/queryClient';
import { routes } from './app/routes';
import './styles/index.css';

/** Unless it is switched off (VITE_API_MOCKS=off), the mock API answers /api/* in the browser. */
async function startMockApi() {
  if (import.meta.env.VITE_API_MOCKS === 'off') return;
  const { worker } = await import('./mocks/browser');
  await worker.start({ onUnhandledRequest: 'bypass', quiet: true });
}

const router = createBrowserRouter(routes);
const queryClient = createQueryClient();

startMockApi().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Providers queryClient={queryClient}>
        <RouterProvider router={router} />
      </Providers>
    </StrictMode>,
  );
});
