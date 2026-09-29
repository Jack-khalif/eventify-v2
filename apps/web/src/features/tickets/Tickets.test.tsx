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
import { seedDemoTicket, ticketsForPhone } from '../../mocks/orders';
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

  it('explains when the link is wrong', async () => {
    renderApp('/t/not-a-real-ticket');
    expect(await screen.findByRole('heading', { name: 'Ticket not found' })).toBeInTheDocument();
  });
});

describe('Ticket delivery preview', () => {
  it('shows the SMS and the email ticket', async () => {
    renderApp(`/t/${ticket.id}/delivery`);
    expect(await screen.findByRole('heading', { name: 'Ticket delivery' })).toBeInTheDocument();
    const sms = screen.getByTestId('sms-preview');
    expect(sms).toHaveTextContent(/^Hi Amina, you're confirmed for Sauti Sessions/);
    expect(sms).toHaveTextContent(`Ticket code ${ticket.code}`);
    expect(sms).toHaveTextContent(`/t/${ticket.id}`);
    expect(screen.getByRole('img', { name: `QR code for ${ticket.code}` })).toBeInTheDocument();
  });
});

describe('Find my tickets', () => {
  async function requestCode(phone = '0712 345 678') {
    const result = renderApp('/tickets');
    await userEvent.type(await screen.findByLabelText('Phone number'), phone);
    await userEvent.click(screen.getByRole('button', { name: 'Text me a code' }));
    await screen.findByLabelText('Code');
    return result;
  }

  it('checks the phone number before sending a code', async () => {
    renderApp('/tickets');
    await userEvent.type(await screen.findByLabelText('Phone number'), '12345');
    await userEvent.click(screen.getByRole('button', { name: 'Text me a code' }));
    expect(screen.getByLabelText('Phone number')).toHaveAccessibleDescription(
      'Enter a valid phone number',
    );
  });

  it('rejects a wrong code', async () => {
    await requestCode();
    expect(screen.getByText(/We sent a 6-digit code to/)).toHaveTextContent('+254 712 345 678');
    await userEvent.type(screen.getByLabelText('Code'), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Show my tickets' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Code')).toHaveAccessibleDescription(
        "That code isn't right. Check the SMS and try again.",
      ),
    );
  });

  it('lists the tickets and keeps them when coming back from a pass', async () => {
    const { router } = await requestCode();
    await userEvent.type(screen.getByLabelText('Code'), TEST_LOOKUP_CODE);
    await userEvent.click(screen.getByRole('button', { name: 'Show my tickets' }));

    const list = await screen.findByRole('list', { name: 'Tickets' });
    const link = within(list).getByRole('link', { name: /Sauti Sessions/ });
    expect(link).toHaveTextContent(ticket.code);

    await userEvent.click(link);
    expect(await screen.findByRole('article', { name: /^Live Pass for/ })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/t/${ticket.id}`);

    await userEvent.click(screen.getByRole('button', { name: 'Tickets' }));
    expect(await screen.findByRole('list', { name: 'Tickets' })).toBeInTheDocument();
  });

  it('says so when a number has no tickets', async () => {
    await requestCode('0798 765 432');
    await userEvent.type(screen.getByLabelText('Code'), TEST_LOOKUP_CODE);
    await userEvent.click(screen.getByRole('button', { name: 'Show my tickets' }));
    expect(await screen.findByText('No tickets for this number')).toBeInTheDocument();
  });
});
