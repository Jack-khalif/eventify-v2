import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/render';
import { signInAs } from '../test/signIn';

describe('app shell', () => {
  it('shows guests the brand, main nav, sign-in and theme toggle, but no create button', () => {
    renderApp('/');
    expect(screen.getByText('EVENTIFY')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Discover' })).toHaveAttribute('href', '/');
    expect(within(nav).getByRole('link', { name: 'Host an event' })).toHaveAttribute(
      'href',
      '/organizer',
    );
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?next=%2Faccount',
    );
    expect(screen.queryByRole('link', { name: 'Create event' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /switch to (dark|light) theme/i }),
    ).toBeInTheDocument();
  });

  it('gives an approved organizer the dashboard link and the create button', async () => {
    signInAs('organizer');
    renderApp('/');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(await within(nav).findByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      '/organizer',
    );
    expect(screen.getByRole('link', { name: 'Create event' })).toHaveAttribute(
      'href',
      '/organizer/events/new',
    );
    expect(screen.getByRole('link', { name: 'Profile: Amani Wanjiru' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
    const tabs = screen.getByRole('navigation', { name: 'Tabs' });
    expect(
      within(tabs)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Discover', 'Tickets', 'Dashboard', 'Profile']);
  });

  it('gives staff the admin link and no create button', async () => {
    signInAs('agent');
    renderApp('/');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(await within(nav).findByRole('link', { name: 'Admin' })).toHaveAttribute(
      'href',
      '/admin',
    );
    expect(screen.queryByRole('link', { name: 'Create event' })).not.toBeInTheDocument();
  });

  it('marks the current section in the header and the tab bar', () => {
    renderApp('/organizer');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Host an event' })).toHaveAttribute(
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
        name: 'Host an event',
      }),
    );
    expect(router.state.location.pathname).toBe('/organizer');
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Sell tickets to your event on Eventify',
      }),
    ).toBeInTheDocument();
  });

  it('toggles the theme from the header', async () => {
    renderApp('/');
    const before = document.documentElement.dataset.theme;
    await userEvent.click(screen.getByRole('button', { name: /switch to/i }));
    expect(document.documentElement.dataset.theme).not.toBe(before);
  });
});

describe('routes', () => {
  it('shows the Create event screen to an approved organizer', async () => {
    signInAs('organizer');
    renderApp('/organizer/events/new');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Create event' }),
    ).toBeInTheDocument();
  });

  it('shows a not-found page for unknown nested paths', () => {
    renderApp('/some/unknown/page');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
