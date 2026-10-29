import {
  importVerifyKey,
  liveCode,
  LIVE_CODE_STEP_MS,
  verifyTicketQr,
  type TicketView,
} from '@eventify/shared';
import { publicEvents } from '@eventify/shared/fixtures';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEV_QR_PUBLIC_KEY } from '../../mocks/devKeys';
import { seedDemoTicket, ticketsForEmail, ticketsForPhone } from '../../mocks/orders';
import { DEMO_TICKET_PHONE, TEST_LOOKUP_CODE } from '../../mocks/testPhones';
import { renderApp } from '../../test/render';

const START = new Date('2026-09-29T10:00:00+03:00').getTime();
let ticket: TicketView;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(START);
  seedDemoTicket(publicEvents());
  ticket = (await ticketsForPhone(DEMO_TICKET_PHONE, publicEvents()))[0]!;
});
afterEach(() => vi.useRealTimers());

const liveCodeText = () => screen.getByTestId('live-code').textContent;

describe('Live Pass', () => {
  it('shows the ticket with a code that the door can check', async () => {
    renderApp(`/t/${ticket.id}`);
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Sauti Sessions: Afro-house Listening Night',
      }),
    ).toBeInTheDocument();
    const pass = screen.getByRole('article', { name: /^Live Pass for Sauti Sessions/ });
    expect(within(pass).getByText('Amina Otieno')).toBeInTheDocument();
    expect(within(pass).getByText(ticket.code)).toBeInTheDocument();

    const expected = await liveCode(ticket.passSecret, START);
    await waitFor(() => expect(liveCodeText()).toBe(expected));
  });

  it('changes the code when the 4-second window moves on', async () => {
    renderApp(`/t/${ticket.id}`);
    const first = await liveCode(ticket.passSecret, START);
    await waitFor(() => expect(liveCodeText()).toBe(first));

    vi.setSystemTime(START + LIVE_CODE_STEP_MS);
    const next = await liveCode(ticket.passSecret, START + LIVE_CODE_STEP_MS);
    expect(next).not.toBe(first);
    await waitFor(() => expect(liveCodeText()).toBe(next));
  });

  it('draws a backup QR that verifies with the public key', async () => {
    renderApp(`/t/${ticket.id}`);
    const qr = await screen.findByRole('img', { name: `Backup QR for ${ticket.code}` });
    const payload = qr.getAttribute('data-qr-value')!;
    const key = await importVerifyKey(DEV_QR_PUBLIC_KEY);
    expect(await verifyTicketQr(key, payload)).toBe(ticket.id);
  });

  it('shares the event link, never the ticket link', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    try {
      renderApp(`/t/${ticket.id}`);
      await userEvent.click(await screen.findByRole('button', { name: "Share that you're going" }));
      expect(share).toHaveBeenCalledWith(
        expect.objectContaining({ url: expect.stringMatching(/\/e\/sauti-sessions$/) }),
      );
    } finally {
      delete (navigator as { share?: unknown }).share;
    }
  });

  it('transfers the ticket to someone else, after which this pass stops working', async () => {
    const user = userEvent.setup();
    const { unmount } = renderApp(`/t/${ticket.id}`);
    await user.click(await screen.findByRole('button', { name: 'Transfer ticket' }));
    const dialog = screen.getByRole('dialog', { name: 'Transfer this ticket' });
    expect(within(dialog).getByText(ticket.code)).toBeInTheDocument();

    // Not back to the person who already holds it.
    await user.type(within(dialog).getByLabelText('Their name'), 'Amina');
    await user.type(within(dialog).getByLabelText('Their email'), 'amina@example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Transfer ticket' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('already theirs');

    await user.clear(within(dialog).getByLabelText('Their name'));
    await user.type(within(dialog).getByLabelText('Their name'), 'Wanjiru Kamau');
    await user.clear(within(dialog).getByLabelText('Their email'));
    await user.type(within(dialog).getByLabelText('Their email'), 'wanjiru@example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Transfer ticket' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      "We've emailed Wanjiru Kamau's new ticket to wanjiru@example.com.",
    );
    expect(screen.queryByRole('article', { name: /^Live Pass/ })).not.toBeInTheDocument();

    // Wanjiru has a new ticket; Amina's phone lookup no longer finds the old one.
    const [theirs] = await ticketsForEmail('wanjiru@example.com', publicEvents());
    expect(theirs).toMatchObject({ holderName: 'Wanjiru Kamau', index: 1, count: 1 });
    expect(theirs!.code).not.toBe(ticket.code);
    expect(await ticketsForPhone(DEMO_TICKET_PHONE, publicEvents())).toEqual([]);

    // Opening the old link later says where it went.
    unmount();
    renderApp(`/t/${ticket.id}`);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ticket transferred' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/transferred to w•••@example\.com on/)).toBeInTheDocument();
    // …and can send the new holder their ticket again if it never arrived.
    await user.click(screen.getByRole('button', { name: 'Send their ticket again' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Sent again to wanjiru@example.com.',
    );
  });

  it('explains when the link is wrong', async () => {
    renderApp('/t/not-a-real-ticket');
    expect(await screen.findByRole('heading', { name: 'Ticket not found' })).toBeInTheDocument();
  });
});

describe('Ticket delivery preview', () => {
  it('shows the email ticket', async () => {
    renderApp(`/t/${ticket.id}/delivery`);
    expect(await screen.findByRole('heading', { name: 'Ticket delivery' })).toBeInTheDocument();
    expect(screen.getByText('Email ticket')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: `QR code for ${ticket.code}` })).toBeInTheDocument();
  });
});

describe('Your tickets', () => {
  it('keeps email as the supported ticket lookup path for guests', async () => {
    renderApp('/tickets');
    expect(await screen.findByRole('heading', { name: 'Your tickets' })).toBeInTheDocument();
    expect(screen.getByText(/Tickets are delivered by email/i)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /sign in/i }).length).toBeGreaterThan(0);
  });
});
