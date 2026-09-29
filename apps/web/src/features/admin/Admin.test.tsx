import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDemoRole } from '../../mocks/admin';
import { renderApp } from '../../test/render';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-29T10:00:00+03:00'));
});
afterEach(() => vi.useRealTimers());

const stat = (label: string) => screen.getByText(label, { selector: 'dt' }).parentElement!;
/** Table rows only (the phone layout repeats them as cards), without the header row. */
const tableRows = () => screen.getAllByRole('row').slice(1);

describe('Admin overview', () => {
  it('shows platform totals per currency', async () => {
    const user = userEvent.setup();
    renderApp('/admin');
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
    await screen.findByText('Payment health');
    // Amani 432,234 + PayLink 586,296 + Lens 60,800 are still owed; Deng was paid.
    expect(within(stat('Pending payouts')).getByText('KSh 1,079,330')).toBeInTheDocument();
    expect(within(stat('Pending payouts')).getByText('3 organizers owed')).toBeInTheDocument();
    expect(screen.getByText('4.87%')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /PayLink Kenya/ })).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'SSP' }));
    expect(await screen.findByRole('link', { name: /Deng Training Co\./ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /PayLink Kenya/ })).not.toBeInTheDocument();
  });
});

describe('Organizers', () => {
  it('lists and filters organizers', async () => {
    const user = userEvent.setup();
    renderApp('/admin/organizers');
    await within(await screen.findByRole('table')).findByRole('link', { name: 'Amani Wanjiru' });
    expect(tableRows()).toHaveLength(10);

    await user.selectOptions(screen.getByLabelText('Rate'), 'negotiated');
    expect(tableRows().map((r) => within(r).getAllByRole('cell')[0]!.textContent)).toEqual([
      'Amani Wanjiru',
      'PayLink Kenya',
    ]);
  });

  it('shows an agent only the organizers they onboarded', async () => {
    const user = userEvent.setup();
    renderApp('/admin/organizers');
    await within(await screen.findByRole('table')).findByRole('link', { name: 'Amani Wanjiru' });
    await user.click(screen.getAllByRole('radio', { name: 'Agent' })[0]!);

    await waitFor(() => expect(tableRows()).toHaveLength(3));
    expect(screen.getByText(/Viewing as agent/)).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Admin' });
    expect(within(nav).queryByRole('link', { name: /Approvals/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Agent')).not.toBeInTheDocument();
  });

  it('lets a Super Admin change a rate, which the organizer dashboard then uses', async () => {
    const user = userEvent.setup();
    const { unmount } = renderApp('/admin/organizers/amaniwanjiru');
    await user.click(await screen.findByRole('button', { name: 'Change rate' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('New rate'), { target: { value: '400' } });
    await user.click(within(dialog).getByRole('button', { name: 'Apply rate' }));
    expect(within(dialog).getByText('Give a reason for the change.')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Reason for change'), 'Festival season deal');
    await user.click(within(dialog).getByRole('button', { name: 'Apply rate' }));
    expect(await screen.findByText('Rate for Amani Wanjiru is now 4%.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('org-rate')).toHaveTextContent('4%'));
    expect(screen.getByText('4.5% → 4%')).toBeInTheDocument();
    expect(screen.getByText('Festival season deal')).toBeInTheDocument();
    unmount();

    renderApp('/organizer');
    expect(await screen.findByText('4% rate')).toBeInTheDocument();
  });

  it('sends an agent’s rate below 3% to a Super Admin, who approves it', async () => {
    setDemoRole('agent');
    const user = userEvent.setup();
    const first = renderApp('/admin/organizers/ieee-strathmore');
    await user.click(await screen.findByRole('button', { name: 'Change rate' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('New rate'), { target: { value: '250' } });
    expect(within(dialog).getByText(/a Super Admin has to approve this/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Reason for change'), 'Student society partner');
    await user.click(within(dialog).getByRole('button', { name: 'Send for approval' }));

    expect(
      await screen.findByText(
        '2.5% for IEEE Strathmore Student Branch was sent to a Super Admin for approval.',
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText(/is waiting for Super Admin approval/)).toBeInTheDocument();
    expect(screen.getByTestId('org-rate')).toHaveTextContent('5%');
    first.unmount();

    setDemoRole('super_admin');
    const second = renderApp('/admin/approvals');
    await user.click(
      await screen.findByRole('button', {
        name: 'Approve 2.5% for IEEE Strathmore Student Branch',
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /IEEE Strathmore Student Branch/ }),
      ).not.toBeInTheDocument(),
    );
    // The sample request for Lens Kenya is still waiting.
    expect(screen.getByRole('button', { name: 'Approve 2.4% for Lens Kenya' })).toBeInTheDocument();
    second.unmount();

    renderApp('/admin/organizers/ieee-strathmore');
    await waitFor(() => expect(screen.getByTestId('org-rate')).toHaveTextContent('2.5%'));
    expect(screen.getByText('Grace Achieng, approved by Super Admin')).toBeInTheDocument();
  });
});

describe('Payouts', () => {
  it('records the transfer reference when a payout is marked paid', async () => {
    const user = userEvent.setup();
    renderApp('/admin/payouts');
    const table = await screen.findByRole('table');
    await user.click(within(table).getByRole('button', { name: 'Mark Amani Wanjiru as paid' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('M-Pesa transaction code'), 'x');
    await user.click(within(dialog).getByRole('button', { name: 'Mark as paid' }));
    expect(
      within(dialog).getByText('Enter the M-Pesa or bank reference (letters and numbers).'),
    ).toBeInTheDocument();

    await user.clear(within(dialog).getByLabelText('M-Pesa transaction code'));
    await user.type(within(dialog).getByLabelText('M-Pesa transaction code'), 'sj48kq2p7t');
    await user.click(within(dialog).getByRole('button', { name: 'Mark as paid' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect((await screen.findAllByText(/Ref SJ48KQ2P7T/)).length).toBeGreaterThan(0);
    expect(
      within(table).queryByRole('button', { name: 'Mark Amani Wanjiru as paid' }),
    ).not.toBeInTheDocument();
  });

  it('keeps payouts read-only for agents, and approvals out of reach', async () => {
    setDemoRole('agent');
    const first = renderApp('/admin/payouts');
    expect(
      await screen.findByText('Only a Super Admin can mark payouts as paid.'),
    ).toBeInTheDocument();
    await screen.findAllByText('Amani Wanjiru');
    expect(screen.queryByRole('button', { name: /as paid/ })).not.toBeInTheDocument();
    // Grace's organizers only: PayLink is Peter's.
    expect(screen.queryByText('PayLink Kenya')).not.toBeInTheDocument();
    first.unmount();

    renderApp('/admin/approvals');
    expect(await screen.findByText('Only a Super Admin can see this page.')).toBeInTheDocument();
  });
});
