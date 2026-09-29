import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FOLLOWING_STORAGE_KEY } from '../../lib/following';
import { server } from '../../mocks/node';
import { renderApp } from '../../test/render';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-29T10:00:00+03:00'));
});
afterEach(() => vi.useRealTimers());

const openEvent = async (slug: string) => {
  const result = renderApp(`/e/${slug}`);
  await screen.findByRole('heading', { level: 1 });
  return result;
};
const tickets = () => screen.getByRole('complementary', { name: 'Tickets' });
const tier = (name: RegExp) => within(tickets()).getByRole('radio', { name });

describe('Event page', () => {
  it('shows the event details from the design', async () => {
    await openEvent('sauti-sessions');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Sauti Sessions: Afro-house Listening Night',
    );
    expect(screen.getByText('Music & Arts · Nairobi')).toBeInTheDocument();
    expect(screen.getByText('Fri 2 Oct')).toBeInTheDocument();
    expect(screen.getByText('7:00 PM – 1:00 AM EAT')).toBeInTheDocument();
    expect(screen.getByText('Parklands Rd, Westlands, Nairobi')).toBeInTheDocument();
    expect(screen.getByText(/front-to-back listening session/)).toBeInTheDocument();
    expect(document.title).toBe('Sauti Sessions: Afro-house Listening Night · Eventify');
  });

  it('links the organizer row to their profile and shows the verified badge', async () => {
    await openEvent('sauti-sessions');
    const org = screen.getByRole('link', { name: /Amani Wanjiru/ });
    expect(org).toHaveAttribute('href', '/amaniwanjiru');
    expect(within(org).getByRole('img', { name: 'Verified' })).toBeInTheDocument();
    expect(
      within(org).getByText('Independent artist · eventify.co/amaniwanjiru'),
    ).toBeInTheDocument();
  });

  it('starts on the first tier on sale and disables sold-out tiers', async () => {
    await openEvent('sauti-sessions');
    expect(tier(/Early Bird/)).toBeDisabled();
    expect(within(tier(/Early Bird/).closest('label')!).getByText('SOLD OUT')).toBeInTheDocument();
    expect(tier(/Regular/)).toBeChecked();
    expect(within(tickets()).getByText('1 × Regular')).toBeInTheDocument();
    expect(
      within(tickets()).getByRole('link', { name: 'Get tickets, 1 × Regular, KSh 1,200' }),
    ).toBeInTheDocument();
  });

  it('updates the total when the tier or quantity changes', async () => {
    await openEvent('sauti-sessions');
    await userEvent.click(tier(/VIP/));
    await userEvent.click(within(tickets()).getByRole('button', { name: 'More' }));

    expect(within(tickets()).getByText('2 × VIP')).toBeInTheDocument();
    const cta = within(tickets()).getByRole('link', { name: 'Get tickets, 2 × VIP, KSh 6,000' });
    expect(cta).toHaveAttribute('href', '/e/sauti-sessions/checkout?tier=tier_sauti_vip&qty=2');
  });

  it('warns when few are left and caps quantity at what remains', async () => {
    await openEvent('paylink-launch');
    const earlyBird = tier(/Early Bird/);
    expect(within(earlyBird.closest('label')!).getByText('ONLY 8 LEFT')).toBeInTheDocument();

    const more = within(tickets()).getByRole('button', { name: 'More' });
    for (let i = 0; i < 9; i++) await userEvent.click(more);
    expect(within(tickets()).getByText('8 × Early Bird')).toBeInTheDocument();
    expect(more).toBeDisabled();
  });

  it('never allows more than 10 tickets per order', async () => {
    await openEvent('pwani-taarab');
    const more = within(tickets()).getByRole('button', { name: 'More' });
    for (let i = 0; i < 12; i++) await userEvent.click(more);
    expect(within(tickets()).getByText('10 × Regular')).toBeInTheDocument();
  });

  it('says "Reserve spot" for free events', async () => {
    await openEvent('ieee-hackathon');
    expect(
      within(tickets()).getByRole('link', { name: 'Reserve spot, 1 × Free RSVP, Free' }),
    ).toBeInTheDocument();
  });

  it('marks MoMo and card as coming soon (M-Pesa only at launch)', async () => {
    await openEvent('sauti-sessions');
    const methods = within(tickets()).getByLabelText('Payment methods');
    expect(within(methods).getByText('M-PESA')).toBeInTheDocument();
    expect(within(methods).getByText('MTN MOMO · soon')).toBeInTheDocument();
    expect(within(methods).getByText('Card · soon')).toBeInTheDocument();
  });

  it('shows a mobile buy bar in place of the tab bar', async () => {
    await openEvent('sauti-sessions');
    const bar = screen.getByTestId('buy-bar');
    expect(within(bar).getByText('1 × Regular')).toBeInTheDocument();
    expect(within(bar).getByText('KSh 1,200')).toBeInTheDocument();
    expect(
      within(bar).getByRole('link', { name: 'Get tickets, 1 × Regular, KSh 1,200' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Tabs' })).not.toBeInTheDocument();
  });

  it('shows "Sold out" everywhere when no tier can be bought', async () => {
    server.use(
      http.get('*/api/events/:slug', async () => {
        const { publicEvents } = await import('@eventify/shared/fixtures');
        const e = publicEvents().find((x) => x.slug === 'pwani-taarab')!;
        return HttpResponse.json({
          ...e,
          tiers: e.tiers.map((t) => ({ ...t, quantity: 10, sold: 10 })),
        });
      }),
    );
    await openEvent('pwani-taarab');
    expect(within(tickets()).getByRole('button', { name: 'Sold out' })).toBeDisabled();
    expect(
      within(screen.getByTestId('buy-bar')).getByRole('button', { name: 'Sold out' }),
    ).toBeDisabled();
  });

  it('copies the share link', async () => {
    const user = userEvent.setup();
    await openEvent('sauti-sessions');
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/e/sauti-sessions`);
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('builds WhatsApp and X share links and a directions link', async () => {
    await openEvent('sauti-sessions');
    const url = encodeURIComponent(`${window.location.origin}/e/sauti-sessions`);
    expect(screen.getByRole('link', { name: 'WhatsApp' }).getAttribute('href')).toContain(url);
    expect(screen.getByRole('link', { name: 'X' }).getAttribute('href')).toContain(`url=${url}`);
    expect(screen.getByRole('link', { name: 'Get directions' }).getAttribute('href')).toContain(
      encodeURIComponent('The Alchemist, Westlands, Parklands Rd'),
    );
  });

  it('follows the organizer and remembers it', async () => {
    await openEvent('sauti-sessions');
    await userEvent.click(screen.getByRole('button', { name: 'Follow Amani Wanjiru' }));
    expect(screen.getByRole('button', { name: 'Unfollow Amani Wanjiru' })).toHaveTextContent(
      'Following',
    );
    expect(JSON.parse(localStorage.getItem(FOLLOWING_STORAGE_KEY)!)).toEqual(['amaniwanjiru']);
  });

  it('opens Google Calendar pre-filled, like Get directions opens Maps', async () => {
    await openEvent('sauti-sessions');
    const link = screen.getByRole('link', { name: 'Add to calendar' });
    expect(link).toHaveAttribute('target', '_blank');
    const url = new URL(link.getAttribute('href')!);
    expect(url.hostname).toBe('calendar.google.com');
    expect(url.searchParams.get('dates')).toBe('20261002T160000Z/20261002T220000Z');
    expect(screen.getByRole('link', { name: 'Outlook' }).getAttribute('href')).toContain(
      'outlook.live.com',
    );
  });

  it('uses the organizer’s exact map pin for directions when set', async () => {
    server.use(
      http.get('*/api/events/:slug', async () => {
        const { publicEvents } = await import('@eventify/shared/fixtures');
        const e = publicEvents().find((x) => x.slug === 'sauti-sessions')!;
        return HttpResponse.json({ ...e, mapUrl: 'https://maps.app.goo.gl/abc123' });
      }),
    );
    await openEvent('sauti-sessions');
    expect(screen.getByRole('link', { name: 'Get directions' })).toHaveAttribute(
      'href',
      'https://maps.app.goo.gl/abc123',
    );
    // The venue name people see stays the same.
    expect(screen.getByText('The Alchemist, Westlands', { selector: 'span' })).toBeInTheDocument();
  });

  it('downloads an .ics file for Apple and other calendars', async () => {
    const createObjectURL = vi.fn(() => 'blob:ics');
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await openEvent('sauti-sessions');

    await userEvent.click(screen.getByRole('button', { name: 'Apple / other' }));

    expect(click).toHaveBeenCalled();
    const blob = (createObjectURL.mock.calls[0] as unknown as [Blob])[0];
    expect(await blob.text()).toContain('SUMMARY:Sauti Sessions: Afro-house Listening Night');
  });

  it('shows a not-found page for an unknown slug', async () => {
    renderApp('/e/no-such-event');
    expect(await screen.findByRole('heading', { name: 'Event not found' })).toBeInTheDocument();
  });

  it('goes back to Discover with filters intact', async () => {
    const { router } = renderApp('/?city=Juba');
    await userEvent.click(
      await screen
        .findAllByRole('link', { name: 'Mizizi: New Work by Five Juba Painters' })
        .then((l) => l[0]!),
    );
    await screen.findByRole('heading', { level: 1, name: /Mizizi/ });

    await userEvent.click(screen.getByRole('button', { name: 'All events' }));
    expect(router.state.location.search).toBe('?city=Juba');
  });
});
