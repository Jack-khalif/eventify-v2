import { Outlet } from 'react-router';
import { BottomTabs } from './BottomTabs';
import { Header } from './Header';
import { ScrollToTop } from './ScrollToTop';

export function AppLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <ScrollToTop />
      <Header />
      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
      <BottomTabs />
    </div>
  );
}
