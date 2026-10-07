import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../test/render';
import { signInAs } from '../../test/signIn';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-29T10:00:00+03:00'));
  signInAs('superAdmin');
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
    signInAs('agent');
    renderApp('/admin/organizers');
    await within(await screen.findByRole('table')).findByRole('link', { name: 'Amani Wanjiru' });

    expect(tableRows()).toHaveLength(3);
    expect(screen.getByText(/Signed in as agent/)).toBeInTheDocument();
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

    signInAs('organizer');
    renderApp('/organizer');
    expect(await screen.findByText('4% rate')).toBeInTheDocument();
  });

  it('sends an agent’s rate below 3% to a Super Admin, who approves it', async () => {
    signInAs('agent');
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

    signInAs('superAdmin');
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
    expect(screen.getByText('Grace Achieng, approved by Naomi Kiptoo')).toBeInTheDocument();
  });
});

describe('Organizer approval', () => {
  it('lists applications and lets a Super Admin approve one', async () => {
    const user = userEvent.setup();
    renderApp('/admin/approvals');
    const approve = await screen.findByRole('button', {
      name: 'Approve Mizizi Art Collective as an organizer',
    });
    expect(screen.getByText(/collective of painters and printmakers/)).toBeInTheDocument();
    // One application plus the sample rate request.
    const nav = screen.getByRole('navigation', { name: 'Admin' });
    await waitFor(() =>
      expect(within(nav).getByRole('link', { name: /Approvals/ })).toHaveTextContent(
        'Approvals2 pending',
      ),
    );

    await user.click(approve);
    expect(await screen.findByText('No applications waiting.')).toBeInTheDocument();
  });

  it('lets a Super Admin suspend and reinstate an organizer', async () => {
    const user = userEvent.setup();
    renderApp('/admin/organizers/amaniwanjiru');
    await user.click(await screen.findByRole('button', { name: 'Suspend' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Suspend organizer' }),
    );
    expect(await screen.findByText('Amani Wanjiru is suspended.')).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Reinstate' }));
    expect(await screen.findByText('Amani Wanjiru can now publish events.')).toBeInTheDocument();
  });

  it('gives agents no way to approve or suspend', async () => {
    signInAs('agent');
    renderApp('/admin/organizers/mizizi');
    await screen.findByRole('heading', { level: 1, name: 'Mizizi Art Collective' });
    expect(screen.queryByText('Publishing access')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Approve|Suspend/ })).not.toBeInTheDocument();
  });
});

describe('Admin access', () => {
  it('sends guests to sign in and comes back afterwards', async () => {
    localStorage.clear();
    const { router } = renderApp('/admin/payouts');
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(router.state.location.pathname + router.state.location.search).toBe(
      '/login?next=%2Fadmin%2Fpayouts',
    );
  });

  it('turns away signed-in people who are not staff', async () => {
    signInAs('organizer');
    renderApp('/admin');
    expect(
      await screen.findByRole('heading', { name: "You don't have access to this page" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Admin' })).not.toBeInTheDocument();
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
    signInAs('agent');
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
