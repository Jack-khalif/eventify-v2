import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../mocks/node';
import { renderApp } from '../../test/render';

// Freeze "today" at Tuesday 29 Sep 2026 so "This weekend" is Fri 2 – Sun 4 Oct, as in the design.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-29T10:00:00+03:00'));
});
afterEach(() => vi.useRealTimers());

const weekend = () => screen.getByRole('region', { name: 'This weekend' });
const upcoming = () => screen.getByRole('region', { name: 'Upcoming' });
const cardTitles = (region: HTMLElement) =>
  within(region)
    .queryAllByRole('heading', { level: 3 })
    .map((h) => h.textContent);

describe('Discover', () => {
  it('shows the weekend rail and every upcoming event', async () => {
    renderApp('/discover');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("What's on in East Africa");

    expect(await within(upcoming()).findByText('10 events')).toBeInTheDocument();
    expect(within(weekend()).getByText('Fri 2 – Sun 4 Oct')).toBeInTheDocument();
    expect(cardTitles(weekend())).toEqual([
      'Sauti Sessions: Afro-house Listening Night',
      'IEEE Strathmore Hackathon 2026',
      'Mizizi: New Work by Five Juba Painters',
      'Sunday Jazz at the Arboretum',
    ]);
  });

  it('renders cards like the design: badge, kicker, date, venue and price', async () => {
    renderApp('/discover');
    const title = await within(upcoming()).findByRole('link', {
      name: 'Sauti Sessions: Afro-house Listening Night',
    });
    expect(title).toHaveAttribute('href', '/e/sauti-sessions');

    const card = title.closest('article')!;
    expect(within(card).getByText('Music & Arts · Nairobi')).toBeInTheDocument();
    expect(within(card).getByText('Fri 2 Oct · The Alchemist, Westlands')).toBeInTheDocument();
    expect(within(card).getByText('From KSh 600')).toBeInTheDocument();

    const freeCard = within(upcoming())
      .getByRole('link', { name: 'IEEE Strathmore Hackathon 2026' })
      .closest('article')!;
    expect(within(freeCard).getByText('Free')).toHaveClass('text-accent-text');
  });

  it('filters by city and updates the headline and URL', async () => {
    const { router } = renderApp('/discover');
    await within(upcoming()).findByText('10 events');

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'City' }), 'Juba');

    expect(await within(upcoming()).findByText('3 events')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("What's on in Juba");
    expect(router.state.location.search).toBe('?city=Juba');
    await waitFor(() =>
      expect(cardTitles(weekend())).toEqual(['Mizizi: New Work by Five Juba Painters']),
    );
  });

  it('filters by category chip, including "Free"', async () => {
    renderApp('/discover');
    await within(upcoming()).findByText('10 events');

    const free = screen.getByRole('button', { name: 'Free' });
    await userEvent.click(free);

    expect(free).toHaveAttribute('aria-pressed', 'true');
    expect(await within(upcoming()).findByText('3 events')).toBeInTheDocument();
    expect(cardTitles(upcoming())).toEqual([
      'IEEE Strathmore Hackathon 2026',
      'Mizizi: New Work by Five Juba Painters',
      'Open Mic & Poetry Slam',
    ]);
  });

  it('searches after the user stops typing', async () => {
    const { router } = renderApp('/discover');
    await within(upcoming()).findByText('10 events');

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search events' }), 'arboretum');

    expect(await within(upcoming()).findByText('1 event')).toBeInTheDocument();
    expect(router.state.location.search).toBe('?q=arboretum');
  });

  it('restores filters from a shared link', async () => {
    renderApp('/discover?city=Nairobi&category=Campus');
    expect(await within(upcoming()).findByText('2 events')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'City' })).toHaveValue('Nairobi');
    expect(screen.getByRole('button', { name: 'Campus' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('ignores unknown values in the URL instead of breaking', async () => {
    renderApp('/discover?city=Atlantis&category=Nope');
    expect(await within(upcoming()).findByText('10 events')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('East Africa');
  });

  it('shows an empty state that clears every filter', async () => {
    const { router } = renderApp('/discover?city=Juba&category=Campus');
    expect(await screen.findByText('No events match yet')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(await within(upcoming()).findByText('10 events')).toBeInTheDocument();
    expect(router.state.location.search).toBe('');
    expect(screen.getByRole('searchbox', { name: 'Search events' })).toHaveValue('');
  });

  it('shows a retry option when the API fails', async () => {
    server.use(http.get('*/api/events', () => HttpResponse.json({}, { status: 500 })));
    renderApp('/discover');
    const alerts = await screen.findAllByRole('alert');
    expect(alerts[0]).toHaveTextContent("Couldn't load events");

    server.resetHandlers();
    await userEvent.click(within(alerts[0]!).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(cardTitles(weekend())).toHaveLength(4));
  });

  it('rejects responses that do not match the shared schema', async () => {
    server.use(http.get('*/api/events', () => HttpResponse.json([{ id: 'broken' }])));
    renderApp('/discover');
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
  });

  it('links the CTA band to hosting, not straight to event creation', async () => {
    renderApp('/discover');
    expect(screen.getByRole('link', { name: 'Host an event →' })).toHaveAttribute(
      'href',
      '/organizer',
    );
  });
});
