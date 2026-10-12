import { Outlet, useMatches } from 'react-router';
import { SupportButton } from '../components/SupportButton';
import { BottomTabs } from './BottomTabs';
import { Header } from './Header';
import { ScrollToTop } from './ScrollToTop';

/** Per-route options, set with `handle` in routes.tsx. */
export type RouteHandle = {
  /** Pages with their own sticky bottom bar (event page, checkout), and the landing page, hide the mobile tabs. */
  hideTabs?: boolean;
  /** The door scanner is for staff at work, with the camera filling the screen: no support button. */
  hideSupport?: boolean;
};

export function AppLayout() {
  const matches = useMatches();
  const handles = matches.map((m) => m.handle as RouteHandle | undefined);
  const hideTabs = handles.some((h) => h?.hideTabs);
  const hideSupport = handles.some((h) => h?.hideSupport);

  return (
    <div className="flex min-h-dvh flex-col">
      <ScrollToTop />
      <Header />
      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
      {!hideSupport && <SupportButton />}
      {!hideTabs && <BottomTabs />}
    </div>
  );
}
