import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../test/render';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-29T10:00:00+03:00'));
});
afterEach(() => vi.useRealTimers());

describe('Organizer profile', () => {
  it('shows name, badge, handle, bio, upcoming and past events', async () => {
    renderApp('/ieee-strathmore');
    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('IEEE Strathmore Student Branch');
    expect(within(heading).getByRole('img', { name: 'Verified' })).toBeInTheDocument();
    expect(screen.getByText('Student society · eventify.co/ieee-strathmore')).toBeInTheDocument();
    expect(screen.getByText(/We run hackathons/)).toBeInTheDocument();

    const upcoming = screen.getByRole('region', { name: 'Upcoming events' });
    expect(
      await within(upcoming).findByRole('link', { name: 'IEEE Strathmore Hackathon 2026' }),
    ).toHaveAttribute('href', '/e/ieee-hackathon');

    const past = screen.getByRole('region', { name: 'Past events' });
    expect(within(past).getByText('Career Fair 2025')).toBeInTheDocument();
  });

  it('handles organizers without a bio, upcoming or past events', async () => {
    renderApp('/lenskenya');
    await screen.findByRole('heading', { level: 1, name: /Lens Kenya/ });
    expect(screen.queryByRole('img', { name: 'Verified' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Past events' })).not.toBeInTheDocument();
  });

  it('shares follow state with the event page', async () => {
    renderApp('/amaniwanjiru');
    await userEvent.click(await screen.findByRole('button', { name: 'Follow Amani Wanjiru' }));

    const upcoming = screen.getByRole('region', { name: 'Upcoming events' });
    await userEvent.click(await within(upcoming).findByRole('link', { name: /Sauti Sessions/ }));
    expect(
      await screen.findByRole('button', { name: 'Unfollow Amani Wanjiru' }),
    ).toBeInTheDocument();
  });

  it('shows not-found for an unknown handle', async () => {
    renderApp('/nobody-here');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('keeps the tab bar on profile pages', async () => {
    renderApp('/amaniwanjiru');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByRole('navigation', { name: 'Tabs' })).toBeInTheDocument();
  });
});
