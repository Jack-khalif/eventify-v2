import type { RouteObject } from 'react-router';
import { AdminLayout } from '../features/admin/AdminLayout';
import { AgentsPage } from '../features/admin/AgentsPage';
import { ApprovalsPage } from '../features/admin/ApprovalsPage';
import { OrganizerDetailPage } from '../features/admin/OrganizerDetailPage';
import { OrganizersPage } from '../features/admin/OrganizersPage';
import { OverviewPage } from '../features/admin/OverviewPage';
import { PayoutsPage } from '../features/admin/PayoutsPage';
import { SecurityPage } from '../features/admin/SecurityPage';
import { StaffPage } from '../features/admin/StaffPage';
import { AccountPage } from '../features/auth/AccountPage';
import { ActiveOrganizerOnly, StaffOnly } from '../features/auth/guards';
import { LoginPage } from '../features/auth/LoginPage';
import { UiKit } from '../features/dev/UiKit';
import { CheckinPage } from '../features/checkin/CheckinPage';
import { CheckoutPage } from '../features/checkout/CheckoutPage';
import { CreateEventPage } from '../features/create-event/CreateEventPage';
import { OrderPage } from '../features/checkout/OrderPage';
import { DiscoverPage } from '../features/discover/DiscoverPage';
import { EventPage } from '../features/event/EventPage';
import { OrganizerPage } from '../features/organizer/OrganizerPage';
import { SavedPage } from '../features/saved/SavedPage';
import { ApplyPage } from '../features/host/ApplyPage';
import { LandingPage } from '../features/landing/LandingPage';
import { OrganizerHome } from '../features/host/OrganizerHome';
import { PrivacyPage } from '../features/legal/PrivacyPage';
import { TermsPage } from '../features/legal/TermsPage';
import { DeliveryPage } from '../features/tickets/DeliveryPage';
import { FindTicketsPage } from '../features/tickets/FindTicketsPage';
import { TicketPage } from '../features/tickets/TicketPage';
import { NotFound } from '../features/placeholder/NotFound';
import { AppLayout, type RouteHandle } from './AppLayout';

/**
 * URL scheme follows the design: eventify.co/e/{slug}, /t/{ticketId}, /checkin/{code}, /{orgHandle}.
 * Buying, tickets and door check-in need no account. Publishing needs an approved organizer and
 * /admin needs staff; the guards only pick the screen, the API enforces the same rules.
 */
export const routes: RouteObject[] = [
  {
    path: 'admin',
    element: (
      <StaffOnly>
        <AdminLayout />
      </StaffOnly>
    ),
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'organizers', element: <OrganizersPage /> },
      { path: 'organizers/:handle', element: <OrganizerDetailPage /> },
      { path: 'approvals', element: <ApprovalsPage /> },
      { path: 'agents', element: <AgentsPage /> },
      { path: 'payouts', element: <PayoutsPage /> },
      { path: 'staff', element: <StaffPage /> },
      { path: 'security', element: <SecurityPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <LandingPage />, handle: { hideTabs: true } satisfies RouteHandle },
      { path: 'discover', element: <DiscoverPage /> },
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
      { path: 'organizer', element: <OrganizerHome /> },
      { path: 'organizer/apply', element: <ApplyPage /> },
      {
        path: 'organizer/events/new',
        element: (
          <ActiveOrganizerOnly>
            <CreateEventPage />
          </ActiveOrganizerOnly>
        ),
      },
      {
        path: 'checkin/:code',
        element: <CheckinPage />,
        handle: { hideTabs: true } satisfies RouteHandle,
      },
      { path: 'login', element: <LoginPage /> },
      { path: 'tickets', element: <FindTicketsPage /> },
      { path: 'saved', element: <SavedPage /> },
      { path: 'account', element: <AccountPage /> },
      { path: 'terms', element: <TermsPage /> },
      { path: 'privacy', element: <PrivacyPage /> },
      ...(import.meta.env.DEV ? [{ path: 'dev/ui', element: <UiKit /> }] : []),
      /* Organizer public profile: eventify.co/{handle}. Kept last so named routes win. */
      { path: ':handle', element: <OrganizerPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
];
