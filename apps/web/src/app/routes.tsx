import type { RouteObject } from 'react-router';
import { AdminLayout } from '../features/admin/AdminLayout';
import { AgentsPage } from '../features/admin/AgentsPage';
import { ApprovalsPage } from '../features/admin/ApprovalsPage';
import { OrganizerDetailPage } from '../features/admin/OrganizerDetailPage';
import { OrganizersPage } from '../features/admin/OrganizersPage';
import { OverviewPage } from '../features/admin/OverviewPage';
import { PayoutsPage } from '../features/admin/PayoutsPage';
import { UiKit } from '../features/dev/UiKit';
import { CheckinPage } from '../features/checkin/CheckinPage';
import { CheckoutPage } from '../features/checkout/CheckoutPage';
import { CreateEventPage } from '../features/create-event/CreateEventPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { OrderPage } from '../features/checkout/OrderPage';
import { DiscoverPage } from '../features/discover/DiscoverPage';
import { EventPage } from '../features/event/EventPage';
import { OrganizerPage } from '../features/organizer/OrganizerPage';
import { SavedPage } from '../features/saved/SavedPage';
import { ComingSoon } from '../features/placeholder/ComingSoon';
import { DeliveryPage } from '../features/tickets/DeliveryPage';
import { FindTicketsPage } from '../features/tickets/FindTicketsPage';
import { TicketPage } from '../features/tickets/TicketPage';
import { NotFound } from '../features/placeholder/NotFound';
import { AppLayout, type RouteHandle } from './AppLayout';

/**
 * URL scheme follows the design: eventify.co/e/{slug}, /t/{ticketId}, /checkin/{code}, /{orgHandle}.
 * Placeholders name the phase that replaces them.
 */
export const routes: RouteObject[] = [
  {
    path: 'admin',
    element: <AdminLayout />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'organizers', element: <OrganizersPage /> },
      { path: 'organizers/:handle', element: <OrganizerDetailPage /> },
      { path: 'approvals', element: <ApprovalsPage /> },
      { path: 'agents', element: <AgentsPage /> },
      { path: 'payouts', element: <PayoutsPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <DiscoverPage /> },
      { path: 'e/:slug', element: <EventPage />, handle: { hideTabs: true } satisfies RouteHandle },
      {
        path: 'e/:slug/checkout',
        element: <CheckoutPage />,
        handle: { hideTabs: true } satisfies RouteHandle,
      },
      {
        path: 'e/:slug/checkout/:orderId',
        element: <OrderPage />,
        handle: { hideTabs: true } satisfies RouteHandle,
      },
      {
        path: 't/:ticketId',
        element: <TicketPage />,
        handle: { hideTabs: true } satisfies RouteHandle,
      },
      { path: 't/:ticketId/delivery', element: <DeliveryPage /> },
      { path: 'organizer', element: <DashboardPage /> },
      { path: 'organizer/events/new', element: <CreateEventPage /> },
      {
        path: 'checkin/:code',
        element: <CheckinPage />,
        handle: { hideTabs: true } satisfies RouteHandle,
      },
      { path: 'login', element: <ComingSoon title="Sign in" phase="Phase A9" /> },
      { path: 'tickets', element: <FindTicketsPage /> },
      { path: 'saved', element: <SavedPage /> },
      {
        path: 'account',
        element: (
          <ComingSoon
            title="Organizer sign-in"
            phase="Phase A9"
            note="Organizers sign in here to reach their dashboard."
          />
        ),
      },
      ...(import.meta.env.DEV ? [{ path: 'dev/ui', element: <UiKit /> }] : []),
      /* Organizer public profile: eventify.co/{handle}. Kept last so named routes win. */
      { path: ':handle', element: <OrganizerPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
];
