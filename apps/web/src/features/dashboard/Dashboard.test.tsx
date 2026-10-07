import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    expect(within(stat('Check-ins')).getByText('56% of sold')).toBeInTheDocument();

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
});
