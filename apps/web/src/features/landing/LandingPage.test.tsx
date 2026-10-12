import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SESSION_STORAGE_KEY } from '../../lib/session';
import { verifySignIn } from '../../mocks/auth';
import { renderApp } from '../../test/render';
import { signInAs } from '../../test/signIn';

describe('Landing', () => {
  it('introduces Eventify and sends buyers to Discover and hosts to the organizer page', () => {
    renderApp('/');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      "East Africa's best way to discover events and sell tickets",
    );
    expect(screen.getByRole('link', { name: "Browse what's on" })).toHaveAttribute(
      'href',
      '/discover',
    );
    expect(screen.getByRole('link', { name: 'Host an event — free to list' })).toHaveAttribute(
      'href',
      '/organizer',
    );
    expect(screen.getByRole('link', { name: 'Start for free' })).toHaveAttribute(
      'href',
      '/organizer',
    );
  });

  it('has no tab bar, and links to events and tickets from the footer instead', () => {
    renderApp('/');
    expect(screen.queryByRole('navigation', { name: 'Tabs' })).not.toBeInTheDocument();
    const footer = within(screen.getByRole('navigation', { name: 'Footer' }));
    expect(footer.getByRole('link', { name: 'Discover' })).toHaveAttribute('href', '/discover');
    expect(footer.getByRole('link', { name: 'Find my tickets' })).toHaveAttribute(
      'href',
      '/tickets',
    );
  });

  it('names no fee rate, since organizers are on different ones', () => {
    renderApp('/');
    expect(screen.getByText('To list an event. Our fee comes out of your payout')).toBeVisible();
    expect(screen.getByRole('main')).not.toHaveTextContent(/\d\s?%/);
  });

  it('only promises the payment method that is switched on', () => {
    renderApp('/');
    expect(screen.getByText('Pay with M-Pesa')).toBeInTheDocument();
    expect(screen.getByText(/MTN Mobile Money and card on the way/)).toBeInTheDocument();
  });

  it('is skipped by people who are signed in, who go to where they work', async () => {
    signInAs('organizer');
    const organizer = renderApp('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(organizer.router.state.location.pathname).toBe('/organizer');
    organizer.unmount();

    signInAs('agent');
    const staff = renderApp('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
    expect(staff.router.state.location.pathname).toBe('/admin');
  });

  it('sends a signed-in buyer to the events', async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, verifySignIn('njeri@example.com', '123456')!.token);
    const { router } = renderApp('/');
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(/What's on/);
    expect(router.state.location.pathname).toBe('/discover');
  });

  it('opens old shared Discover links on the Discover page', async () => {
    const { router } = renderApp('/?city=Juba');
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent("What's on in Juba");
    expect(router.state.location.pathname + router.state.location.search).toBe(
      '/discover?city=Juba',
    );
  });
});
