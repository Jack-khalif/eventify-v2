import { Outlet, useMatches } from 'react-router';
import { BottomTabs } from './BottomTabs';
import { Header } from './Header';
import { ScrollToTop } from './ScrollToTop';

/** Per-route options, set with `handle` in routes.tsx. */
export type RouteHandle = {
  /** Pages with their own sticky bottom bar (event page, checkout), and the landing page, hide the mobile tabs. */
  hideTabs?: boolean;
};

export function AppLayout() {
  const matches = useMatches();
  const hideTabs = matches.some((m) => (m.handle as RouteHandle | undefined)?.hideTabs);

  return (
    <div className="flex min-h-dvh flex-col">
      <ScrollToTop />
      <Header />
      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
      {!hideTabs && <BottomTabs />}
    </div>
  );
}
