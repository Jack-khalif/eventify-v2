import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../test/render';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-29T10:00:00+03:00'));
});
afterEach(() => vi.useRealTimers());

type User = ReturnType<typeof userEvent.setup>;

async function fillDetails(user: User) {
  await user.type(await screen.findByLabelText('Event title'), 'Sunset Rooftop Sessions');
  await user.type(screen.getByLabelText('Venue or online link'), 'Sankara Rooftop, Westlands');
  // Native date and time pickers: set the value the way the browser would.
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-24' } });
  fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '18:00' } });
  fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '23:00' } });
}

describe('Create event', () => {
  it('holds each step until its fields are valid', async () => {
    const user = userEvent.setup();
    renderApp('/organizer/events/new');
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Give your event a title.')).toBeInTheDocument();
    expect(screen.getByText('Add a venue, or an online link.')).toBeInTheDocument();
    expect(screen.getByText('Pick a date.')).toBeInTheDocument();

    await fillDetails(user);
    expect(screen.queryByText('Give your event a title.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Tickets');

    // The default Regular tier has no price yet.
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Enter a price, or 0 for free.')).toBeInTheDocument();
  });

  it('shows the organizer payout per ticket and toggles preset tiers', async () => {
    const user = userEvent.setup();
    renderApp('/organizer/events/new');
    await fillDetails(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await user.type(screen.getByLabelText('Price (KSh)'), '1200');
    // Amani's rate is 4.5%.
    expect(await screen.findByText('KSh 1,146')).toBeInTheDocument();
    expect(screen.getByText(/Eventify fee KSh 54/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'VIP' }));
    expect(screen.getAllByLabelText('Tier name').map((i) => (i as HTMLInputElement).value)).toEqual(
      ['Regular', 'VIP'],
    );
    await user.click(screen.getByRole('button', { name: 'VIP', pressed: true }));
    expect(screen.getAllByLabelText('Tier name')).toHaveLength(1);

    const preview = screen.getByRole('complementary', { name: 'Live preview' });
    expect(within(preview).getByText('Sunset Rooftop Sessions')).toBeInTheDocument();
    expect(within(preview).getByText('KSh 1,200')).toBeInTheDocument();
  });

  it('publishes an event that people can open and that shows on the dashboard', async () => {
    const user = userEvent.setup();
    renderApp('/organizer/events/new');
    await fillDetails(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(screen.getByLabelText('Price (KSh)'), '1200');
    await user.type(screen.getByLabelText('Quantity'), '150');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText('Sankara Rooftop, Westlands, Nairobi')).toBeInTheDocument();
    expect(screen.getByText('Sat 24 Oct · 6:00 PM – 11:00 PM')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Publish event' }));

    expect(await screen.findByRole('heading', { name: 'Your event is live' })).toBeInTheDocument();
    expect(screen.getByTestId('share-url')).toHaveTextContent('/e/sunset-rooftop-sessions');

    await user.click(screen.getByRole('link', { name: 'View event page' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sunset Rooftop Sessions' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('KSh 1,200').length).toBeGreaterThan(0);
  });

  it('lists a published event on the dashboard with no sales yet', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/organizer/events/new');
    await fillDetails(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(screen.getByLabelText('Price (KSh)'), '0');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Publish event' }));
    await user.click(await screen.findByRole('link', { name: 'Go to dashboard' }));

    expect(router.state.location.pathname).toBe('/organizer');
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Sunset Rooftop Sessions' }),
    ).toBeInTheDocument();
    expect(screen.getByText('No tickets sold yet.')).toBeInTheDocument();
    expect(screen.getByText('No sales in the last 14 days yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sunset Rooftop Sessions.*0 sold/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });
});
