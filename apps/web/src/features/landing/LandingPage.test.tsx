import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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

  it('only promises the payment method that is switched on', () => {
    renderApp('/');
    expect(screen.getByText('Pay with M-Pesa')).toBeInTheDocument();
    expect(screen.getByText(/MTN Mobile Money and card on the way/)).toBeInTheDocument();
  });

  it('takes an approved organizer straight to the create form', async () => {
    signInAs('organizer');
    renderApp('/');
    expect(
      await screen.findByRole('link', { name: 'Create an event — free to list' }),
    ).toHaveAttribute('href', '/organizer/events/new');
  });

  it('opens old shared Discover links on the Discover page', async () => {
    const { router } = renderApp('/?city=Juba');
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent("What's on in Juba");
    expect(router.state.location.pathname + router.state.location.search).toBe(
      '/discover?city=Juba',
    );
  });
});
