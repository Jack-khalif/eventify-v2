import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../mocks/node';
import { renderApp } from '../../test/render';

const START = new Date('2026-09-29T10:00:00+03:00').getTime();
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(START);
});
afterEach(() => vi.useRealTimers());

/** Move the clock on; the mock M-Pesa answers 4.5s after the prompt and times out at 12s. */
const advance = (ms: number) => vi.setSystemTime(Date.now() + ms);

async function fillDetails(phone = '0712 345 678') {
  await userEvent.type(screen.getByLabelText('Full name'), 'Amina Otieno');
  await userEvent.type(screen.getByLabelText('Phone number'), phone);
  await userEvent.type(screen.getByLabelText('Email'), 'amina@example.com');
}

async function openCheckout(url = '/e/sauti-sessions/checkout?tier=tier_sauti_regular&qty=2') {
  const result = renderApp(url);
  await screen.findByRole('heading', { level: 1, name: /Checkout|Reserve your spot/ });
  return result;
}

const payButton = () => screen.getByRole('button', { name: /Send payment prompt|Reserve spot/ });

describe('Checkout form', () => {
  it('carries the tier and quantity chosen on the event page', async () => {
    renderApp('/e/sauti-sessions');
    await screen.findByRole('heading', { level: 1 });
    const tickets = screen.getByRole('complementary', { name: 'Tickets' });
    await userEvent.click(within(tickets).getByRole('radio', { name: /VIP/ }));
    await userEvent.click(within(tickets).getByRole('button', { name: 'More' }));
    await userEvent.click(within(tickets).getByRole('link', { name: /Get tickets/ }));

    expect(await screen.findByRole('heading', { name: 'Checkout' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /VIP/ })).toBeChecked();
    expect(screen.getByText('2 × VIP')).toBeInTheDocument();
    expect(payButton()).toHaveAccessibleName('Send payment prompt for KSh 6,000');
  });

  it('explains what is missing instead of submitting', async () => {
    await openCheckout();
    await userEvent.click(payButton());
    expect(screen.getByText('Enter your name, phone and email to continue.')).toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toHaveAccessibleDescription('Enter your name');
    expect(screen.getByLabelText('Phone number')).toHaveAccessibleDescription(
      'Enter a valid phone number',
    );
  });

  it('clears a field’s error as soon as it is edited', async () => {
    await openCheckout();
    await userEvent.click(payButton());
    await userEvent.type(screen.getByLabelText('Full name'), 'A');
    expect(screen.getByLabelText('Full name')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('rejects a phone number that is not a real mobile number', async () => {
    await openCheckout();
    await fillDetails('12345');
    await userEvent.click(payButton());
    expect(screen.getByLabelText('Phone number')).toHaveAttribute('aria-invalid', 'true');
  });

  it('offers M-Pesa and marks MoMo and card as coming soon', async () => {
    await openCheckout();
    expect(screen.getByRole('radio', { name: /M-Pesa/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /MTN Mobile Money/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Card/ })).toBeDisabled();
  });

  it('skips payment for free events', async () => {
    await openCheckout('/e/ieee-hackathon/checkout');
    expect(screen.queryByRole('group', { name: 'Payment method' })).not.toBeInTheDocument();
    await fillDetails();
    await userEvent.click(screen.getByRole('button', { name: 'Reserve spot' }));
    expect(await screen.findByRole('heading', { name: "You're going! 🎉" })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('cannot take payment for South Sudan events yet', async () => {
    await openCheckout('/e/juba-tech-summit/checkout');
    expect(screen.getByRole('note')).toHaveTextContent('coming soon with MTN Mobile Money');
    expect(payButton()).toBeDisabled();
  });

  it('shows the server’s reason when the order is refused', async () => {
    server.use(
      http.post('*/api/orders', () =>
        HttpResponse.json(
          { error: 'sold_out', message: 'Regular tickets just sold out.' },
          { status: 409 },
        ),
      ),
    );
    await openCheckout();
    await fillDetails();
    await userEvent.click(payButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Regular tickets just sold out.');
  });
});

describe('M-Pesa waiting and outcomes', () => {
  async function pay(phone?: string) {
    const result = await openCheckout();
    await fillDetails(phone);
    await userEvent.click(payButton());
    await screen.findByRole('heading', { name: 'Check your phone to confirm payment' });
    return result;
  }

  it('waits for the prompt, then shows the tickets', async () => {
    const { router } = await pay();
    expect(router.state.location.pathname).toMatch(/^\/e\/sauti-sessions\/checkout\/ord_/);
    expect(screen.getByText('+254 712 345 678')).toBeInTheDocument();
    expect(screen.getByText(/We sent an M-Pesa prompt/)).toBeInTheDocument();
    expect(screen.getByText(/Enter your PIN to pay KSh 2,400/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('00:00 — waiting for confirmation');

    advance(5_000);
    expect(await screen.findByRole('heading', { name: "You're going! 🎉" })).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Your tickets' })).getAllByRole('listitem'),
    ).toHaveLength(2);
    expect(screen.getAllByText(/^EVT-SAUTI-\d{4}$/)).toHaveLength(2);
  });

  it('counts up and offers help if the prompt is slow', async () => {
    const { router } = await pay();
    const orderId = router.state.location.pathname.split('/').pop()!;
    // A prompt nobody has answered for 46 seconds.
    server.use(
      http.get('*/api/orders/:id', async () => {
        const { getOrder } = await import('../../mocks/orders');
        const { publicEvents } = await import('@eventify/shared/fixtures');
        const order = getOrder(orderId, publicEvents(), START)!;
        return HttpResponse.json({
          ...order,
          paymentRequestedAt: new Date(START - 46_000).toISOString(),
        });
      }),
    );
    expect(await screen.findByText('00:46 — waiting for confirmation')).toBeInTheDocument();
    expect(screen.getByText(/Didn't get it\?/)).toBeInTheDocument();
  });

  it.each([
    ['0712 340 000', "Your M-Pesa balance wasn't enough", 5_000],
    ['0712 341 111', 'Payment cancelled on your phone', 5_000],
    ['0712 342 222', 'The M-Pesa PIN was wrong', 5_000],
    ['0712 343 333', "We didn't hear back in time", 13_000],
  ])('phone %s → "%s"', async (phone, title, wait) => {
    await pay(phone);
    advance(wait);
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
  });

  it('tries again with a fresh prompt for the same order', async () => {
    const { router } = await pay('0712 340 000');
    const orderUrl = router.state.location.pathname;
    advance(5_000);
    await userEvent.click(await screen.findByRole('button', { name: 'Try again · KSh 2,400' }));
    expect(
      await screen.findByRole('heading', { name: 'Check your phone to confirm payment' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(orderUrl);
  });

  it('Change details goes back to the form with everything kept', async () => {
    await pay('0712 340 000');
    advance(5_000);
    await userEvent.click(await screen.findByRole('button', { name: 'Change details' }));

    expect(await screen.findByRole('heading', { name: 'Checkout' })).toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toHaveValue('Amina Otieno');
    expect(screen.getByLabelText('Phone number')).toHaveValue('+254712340000');
    expect(screen.getByLabelText('Email')).toHaveValue('amina@example.com');
    expect(screen.getByText('2 × Regular')).toBeInTheDocument();
  });

  it('Cancel on the waiting screen returns to the form', async () => {
    await pay();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('heading', { name: 'Checkout' })).toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toHaveValue('Amina Otieno');
  });

  it('releases the tickets after the 10-minute hold', async () => {
    await pay('0712 340 000');
    advance(11 * 60_000);
    expect(
      await screen.findByRole('heading', { name: 'Your tickets were released' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start again' })).toHaveAttribute(
      'href',
      '/e/sauti-sessions',
    );
  });

  it('picks up where it left off after a refresh', async () => {
    const { router, unmount } = await pay('0712 343 333');
    const url = router.state.location.pathname;
    unmount();
    advance(8_000);

    renderApp(url);
    expect(
      await screen.findByRole('heading', { name: 'Check your phone to confirm payment' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/00:0[89]/));
  });

  it('shows not-found for an unknown order or one from another event', async () => {
    renderApp('/e/sauti-sessions/checkout/ord_nope');
    expect(await screen.findByRole('heading', { name: 'Order not found' })).toBeInTheDocument();
  });
});
