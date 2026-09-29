import type { RouteObject } from 'react-router';
import { UiKit } from '../features/dev/UiKit';
import { DiscoverPage } from '../features/discover/DiscoverPage';
import { EventPage } from '../features/event/EventPage';
import { OrganizerPage } from '../features/organizer/OrganizerPage';
import { SavedPage } from '../features/saved/SavedPage';
import { ComingSoon } from '../features/placeholder/ComingSoon';
import { NotFound } from '../features/placeholder/NotFound';
import { AppLayout, type RouteHandle } from './AppLayout';

/**
 * URL scheme follows the design: eventify.co/e/{slug}, /t/{ticketId}, /checkin/{code}, /{orgHandle}.
 * Placeholders name the phase that replaces them.
 */
export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <DiscoverPage /> },
      { path: 'e/:slug', element: <EventPage />, handle: { hideTabs: true } satisfies RouteHandle },
      { path: 'e/:slug/checkout', element: <ComingSoon title="Checkout" phase="Phase A4" /> },
      { path: 't/:ticketId', element: <ComingSoon title="Live Pass" phase="Phase A5" /> },
      { path: 'organizer', element: <ComingSoon title="Organizer dashboard" phase="Phase A6" /> },
      {
        path: 'organizer/events/new',
        element: <ComingSoon title="Create event" phase="Phase A6" />,
      },
      { path: 'checkin/:code', element: <ComingSoon title="Door check-in" phase="Phase A7" /> },
      { path: 'admin/*', element: <ComingSoon title="Admin portal" phase="Phase A8" /> },
      { path: 'login', element: <ComingSoon title="Sign in" phase="Phase A9" /> },
      {
        path: 'tickets',
        element: (
          <ComingSoon
            title="Your tickets"
            phase="Phase A5"
            note="Find your tickets with your phone number and a one-time SMS code."
          />
        ),
      },
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
