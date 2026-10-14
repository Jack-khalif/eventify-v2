import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEvent } from '../../mocks/events';
import { server } from '../../mocks/node';
import { renderApp } from '../../test/render';
import { signInAs } from '../../test/signIn';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-29T10:00:00+03:00'));
  signInAs('organizer');
});
afterEach(() => vi.useRealTimers());

const stat = (label: string) => screen.getByText(label, { selector: 'dt' }).parentElement!;

describe('Organizer dashboard', () => {
  it("shows the next event's sales, fees and payout", async () => {
    renderApp('/organizer');
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Amani Wanjiru')).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Sauti Sessions: Afro-house Listening Night' }),
    ).toBeInTheDocument();

    // 100 + 210 + 84 + 18 tickets; 4.5% rate.
    expect(within(stat('Tickets sold')).getByText('412')).toBeInTheDocument();
    expect(within(stat('Gross sales')).getByText('KSh 436,400')).toBeInTheDocument();
    expect(within(stat('Eventify fees')).getByText('KSh 19,638')).toBeInTheDocument();
    expect(within(stat('Eventify fees')).getByText('4.5% rate')).toBeInTheDocument();
    expect(within(stat('Net payout')).getByText('KSh 416,762')).toBeInTheDocument();
    expect(within(stat('Check-ins')).getByText('56% of tickets')).toBeInTheDocument();

    expect(screen.getByRole('table', { name: 'Tickets sold per day' })).toBeInTheDocument();
    expect(screen.getByText('231 / 412 checked in')).toBeInTheDocument();
    expect(screen.getByText('Main Gate')).toBeInTheDocument();
  });

  it('reveals the door staff link and links to the scanner', async () => {
    const user = userEvent.setup();
    renderApp('/organizer');
    await user.click(await screen.findByRole('button', { name: 'Invite door staff' }));
    expect(screen.getByTestId('door-link')).toHaveTextContent('/checkin/sauti-a92f');
    expect(screen.getByRole('link', { name: 'Preview scanner' })).toHaveAttribute(
      'href',
      '/checkin/sauti-a92f',
    );
  });

  it('lists the organizer’s events with their status', async () => {
    renderApp('/organizer');
    const row = await screen.findByRole('button', { name: /Sauti Sessions.*412 sold.*Live/ });
    expect(row).toHaveAttribute('aria-current', 'true');
  });

  it('deletes an event nobody has a ticket for, after asking', async () => {
    const event = createEvent(
      {
        title: 'Clay Day',
        category: 'Workshops',
        city: 'Nairobi',
        venue: 'Karen Village',
        startsAt: '2026-11-07T10:00:00+03:00',
        endsAt: '2026-11-07T13:00:00+03:00',
        description: ['Bring an apron.'],
        coverImageUrl: null,
        tiers: [
          {
            name: 'Regular',
            note: '',
            priceMinor: 150000,
            quantity: 12,
            saleStartsAt: null,
            saleEndsAt: null,
          },
        ],
      },
      'org_amani',
    );
    const user = userEvent.setup();
    renderApp(`/organizer?event=${event.id}`);
    expect(await screen.findByRole('heading', { name: 'Clay Day' })).toBeInTheDocument();

    // Changing their mind leaves the event where it was.
    await user.click(screen.getByRole('button', { name: 'Delete event' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete Clay Day?' });
    expect(within(dialog).getByText(/This can't be undone/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Keep event' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Clay Day/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete event' }));
    await user.click(screen.getByRole('button', { name: 'Delete for good' }));

    // Back on the next event still on sale, with the deleted one off the list.
    expect(
      await screen.findByRole('heading', { name: 'Sauti Sessions: Afro-house Listening Night' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Clay Day/ })).not.toBeInTheDocument();
  });

  it('issues complimentary tickets that count toward check-ins but not sales', async () => {
    const user = userEvent.setup();
    renderApp('/organizer');
    const card = (await screen.findByRole('heading', { name: 'Complimentary tickets' }))
      .parentElement!.parentElement!;
    await user.click(await within(card).findByRole('button', { name: 'Issue tickets' }));
    const dialog = screen.getByRole('dialog', { name: 'Issue complimentary tickets' });

    // Sold-out tiers can't be picked; the rest say how many are left.
    expect(within(dialog).getByRole('option', { name: 'Early Bird (sold out)' })).toBeDisabled();
    await user.selectOptions(within(dialog).getByLabelText('Tier'), 'VIP (32 left)');
    await user.click(within(dialog).getByRole('button', { name: 'Send ticket' }));
    expect(within(dialog).getByText('Enter their name')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText("Guest's name"), 'Wanjiru Kamau');
    await user.type(within(dialog).getByLabelText('Email'), 'wanjiru@example.com');
    await user.type(within(dialog).getByLabelText('Phone (optional)'), '0712 345 678');
    await user.click(within(dialog).getByRole('button', { name: 'More' }));
    await user.click(within(dialog).getByRole('button', { name: 'Send tickets' }));

    expect(await within(card).findByRole('status')).toHaveTextContent(
      '2 tickets sent to wanjiru@example.com.',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(card).getByText('Wanjiru Kamau')).toBeInTheDocument();
    expect(within(card).getByText('2 × VIP')).toBeInTheDocument();
    expect(await screen.findByText('231 / 414 checked in')).toBeInTheDocument();
    expect(within(stat('Tickets sold')).getByText('412')).toBeInTheDocument();
  });

  it('sends a merch request to the print queue and shows each step the team takes', async () => {
    const user = userEvent.setup();
    const first = renderApp('/organizer');
    const card = (await screen.findByRole('heading', { name: 'Branded merch' })).parentElement!;
    await user.click(await within(card).findByRole('button', { name: 'Request merch' }));
    const dialog = screen.getByRole('dialog', { name: 'Request branded merch' });

    await user.click(within(dialog).getByRole('button', { name: 'Send request' }));
    expect(within(dialog).getByText('Pick at least one item')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Wristbands'), '500');
    await user.type(within(dialog).getByLabelText('Banners'), '2');
    await user.type(
      within(dialog).getByLabelText('Branding notes'),
      'Logo from the poster, black on teal.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Send request' }));
    expect(await within(card).findByRole('status')).toHaveTextContent('Request sent.');
    const list = within(card).getByRole('list', { name: 'Merch requests' });
    expect(within(list).getByText('2 Banners · 500 Wristbands')).toBeInTheDocument();
    expect(within(list).getByText('Received')).toBeInTheDocument();
    first.unmount();

    // A Super Admin picks it up from the print queue.
    signInAs('superAdmin');
    const queue = renderApp('/admin/merch');
    await user.click(
      await screen.findByRole('button', {
        name: "Update Amani Wanjiru's request for Sauti Sessions: Afro-house Listening Night",
      }),
    );
    const update = screen.getByRole('dialog');
    await user.selectOptions(within(update).getByLabelText('Status'), 'In production');
    await user.type(within(update).getByLabelText('Note to the organizer'), 'Ready Thursday.');
    await user.click(within(update).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('In production')).toBeInTheDocument();
    queue.unmount();

    signInAs('organizer');
    renderApp('/organizer');
    const after = (await screen.findByRole('heading', { name: 'Branded merch' })).parentElement!;
    expect(await within(after).findByText('In production')).toBeInTheDocument();
    expect(within(after).getByText('Ready Thursday.')).toBeInTheDocument();
  });

  it('leaves out cards the API doesn’t know about yet, mid-release', async () => {
    const notYet = () =>
      HttpResponse.json({ error: 'not_found', message: 'Not found' }, { status: 404 });
    server.use(
      http.get('*/api/organizer/events/:id/comps', notYet),
      http.get('*/api/organizer/events/:id/merch', notYet),
    );
    renderApp('/organizer');
    expect(await screen.findByText('231 / 412 checked in')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Complimentary tickets' })).toBeNull();
      expect(screen.queryByRole('heading', { name: 'Branded merch' })).toBeNull();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('sends the organizer to support once tickets have been issued', async () => {
    renderApp('/organizer');
    const section = (await screen.findByRole('heading', { name: 'Delete this event' }))
      .parentElement!;
    expect(within(section).getByText(/412 tickets have been issued/)).toBeInTheDocument();
    expect(
      within(section).getByRole('link', { name: 'support@eventifyafrica.co.ke' }),
    ).toHaveAttribute('href', 'mailto:support@eventifyafrica.co.ke');
    expect(screen.queryByRole('button', { name: 'Delete event' })).not.toBeInTheDocument();
  });
});
