import { liveCode } from '@eventify/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scannerCheckIns } from '../../mocks/checkin';
import { allEvents } from '../../mocks/events';
import { server } from '../../mocks/node';
import { seedDemoTicket, ticketsForPhone } from '../../mocks/orders';
import { DEMO_TICKET_PHONE } from '../../mocks/testPhones';
import { renderApp } from '../../test/render';
import { signInAs } from '../../test/signIn';

const URL = '/checkin/sauti-a92f';
type User = ReturnType<typeof userEvent.setup>;

beforeEach(() => seedDemoTicket(allEvents()));
afterEach(() => vi.restoreAllMocks());

async function pickDoor(user: User, door = 'Side Gate') {
  expect(
    await screen.findByRole('heading', { name: 'Which door are you at?' }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: door }));
  await user.click(screen.getByRole('button', { name: 'Start checking in' }));
  await screen.findByText(door, { selector: 'strong' });
}

const count = () => screen.getByTestId('checkin-count');

describe('Door check-in', () => {
  it('turns away a link that is not for any event', async () => {
    renderApp('/checkin/nope-1234');
    expect(
      await screen.findByRole('heading', { name: 'Check-in link not recognised' }),
    ).toBeInTheDocument();
  });

  it('asks for the door once, then remembers it on this device', async () => {
    const user = userEvent.setup();
    const first = renderApp(URL);
    expect(
      await screen.findByRole('heading', { name: 'Sauti Sessions: Afro-house Listening Night' }),
    ).toBeInTheDocument();
    await pickDoor(user);
    // Three sample guests (one already in) plus the demo ticket.
    expect(count()).toHaveTextContent('1 / 4 checked in');
    first.unmount();

    renderApp(URL);
    expect(await screen.findByText('Side Gate', { selector: 'strong' })).toBeInTheDocument();
  });

  it('checks a guest in by search and counts it for their door on the dashboard', async () => {
    const user = userEvent.setup();
    const { unmount } = renderApp(URL);
    await pickDoor(user);
    await user.type(screen.getByRole('searchbox', { name: 'Search guests' }), 'nyandeng');
    await user.click(screen.getByRole('button', { name: 'Check in Nyandeng Deng' }));

    const row = screen.getByText('Nyandeng Deng').closest('li')!;
    expect(within(row).getByText('Checked in')).toBeInTheDocument();
    expect(count()).toHaveTextContent('2 / 4 checked in');
    await waitFor(() => expect(scannerCheckIns('evt_sauti')).toHaveLength(1));
    unmount();

    signInAs('organizer');
    renderApp('/organizer');
    const sideGate = (await screen.findByText('Side Gate')).closest('li')!;
    expect(within(sideGate).getByText('39')).toBeInTheDocument();
    expect(screen.getByText('232 / 412 checked in')).toBeInTheDocument();
  });

  it('admits a Live Pass code once, then flags it as used', async () => {
    const user = userEvent.setup();
    const [ticket] = await ticketsForPhone(DEMO_TICKET_PHONE, allEvents());
    renderApp(URL);
    await pickDoor(user);

    const enter = async (code: string) => {
      await user.type(screen.getByLabelText('Live code'), code);
      await user.click(screen.getByRole('button', { name: 'Check' }));
    };
    await enter(await liveCode(ticket!.passSecret));
    expect(await screen.findByText('Valid')).toBeInTheDocument();
    expect(screen.getByText('Amina Otieno · Regular ticket')).toBeInTheDocument();

    await enter(await liveCode(ticket!.passSecret));
    expect(await screen.findByText('Already used')).toBeInTheDocument();
    expect(screen.getByText('Amina Otieno checked in just now at Side Gate')).toBeInTheDocument();

    await enter('ZZZZZZ');
    expect(await screen.findByText('Code not recognised')).toBeInTheDocument();
  });

  it('keeps checking people in offline and syncs when the connection returns', async () => {
    const user = userEvent.setup();
    renderApp(URL);
    await pickDoor(user);

    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    server.use(http.post('*/api/checkin/:code/sync', () => HttpResponse.error()));
    act(() => void window.dispatchEvent(new Event('offline')));

    await user.type(screen.getByRole('searchbox', { name: 'Search guests' }), 'nyandeng');
    await user.click(screen.getByRole('button', { name: 'Check in Nyandeng Deng' }));
    expect(count()).toHaveTextContent('2 / 4 checked in');
    expect(
      await screen.findByText(/1 check-in will sync when you're back online/),
    ).toBeInTheDocument();
    expect(scannerCheckIns('evt_sauti')).toHaveLength(0);

    server.resetHandlers();
    onLine.mockReturnValue(true);
    act(() => void window.dispatchEvent(new Event('online')));
    expect(
      await screen.findByText('Guest list downloaded. Check-in works without internet.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(scannerCheckIns('evt_sauti')).toHaveLength(1));
  });
});
