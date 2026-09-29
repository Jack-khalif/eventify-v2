import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/render';

describe('app shell', () => {
  it('shows the brand, main nav, create button and theme toggle', () => {
    renderApp('/');
    expect(screen.getByText('EVENTIFY')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Discover' })).toHaveAttribute('href', '/');
    expect(within(nav).getByRole('link', { name: 'For organizers' })).toHaveAttribute(
      'href',
      '/organizer',
    );
    expect(screen.getByRole('link', { name: 'Create event' })).toHaveAttribute(
      'href',
      '/organizer/events/new',
    );
    expect(
      screen.getByRole('button', { name: /switch to (dark|light) theme/i }),
    ).toBeInTheDocument();
  });

  it('marks the current section in the header and the tab bar', () => {
    renderApp('/organizer');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'For organizers' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Discover' })).not.toHaveAttribute('aria-current');
  });

  it('has the four mobile tabs from the design', () => {
    renderApp('/');
    const tabs = screen.getByRole('navigation', { name: 'Tabs' });
    expect(
      within(tabs)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Discover', 'Tickets', 'Saved', 'Profile']);
    expect(within(tabs).getByRole('link', { name: 'Discover' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('navigates between sections', async () => {
    const { router } = renderApp('/');
    await userEvent.click(
      within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', {
        name: 'For organizers',
      }),
    );
    expect(router.state.location.pathname).toBe('/organizer');
    expect(screen.getByRole('heading', { name: 'Organizer dashboard' })).toBeInTheDocument();
  });

  it('toggles the theme from the header', async () => {
    renderApp('/');
    const before = document.documentElement.dataset.theme;
    await userEvent.click(screen.getByRole('button', { name: /switch to/i }));
    expect(document.documentElement.dataset.theme).not.toBe(before);
  });
});

describe('routes', () => {
  it.each([
    ['/e/sauti-sessions/checkout', 'Checkout'],
    ['/t/EVT-SAUTI-0412', 'Live Pass'],
    ['/organizer/events/new', 'Create event'],
    ['/checkin/abc123', 'Door check-in'],
    ['/admin/payouts', 'Admin portal'],
  ])('%s shows the %s screen', (url, heading) => {
    renderApp(url);
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
  });

  it('shows a not-found page for unknown nested paths', () => {
    renderApp('/some/unknown/page');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
