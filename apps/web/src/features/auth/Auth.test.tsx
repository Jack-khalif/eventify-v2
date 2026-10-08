import { accounts } from '@eventify/shared/fixtures';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { TEST_SIGN_INS } from '../../mocks/testPhones';
import { renderApp } from '../../test/render';
import { signInAs } from '../../test/signIn';

type User = ReturnType<typeof userEvent.setup>;

async function signIn(user: User, email: string, button = 'Sign in') {
  await user.type(await screen.findByLabelText('Email'), email);
  await user.click(screen.getByRole('button', { name: 'Email me a code' }));
  await user.type(await screen.findByLabelText('Code'), '123456');
  await user.click(screen.getByRole('button', { name: button }));
}

describe('Sign in', () => {
  it('offers the sample accounts that exist', () => {
    expect(TEST_SIGN_INS.map((s) => s.email)).toEqual(accounts.map((a) => a.email));
  });

  it('rejects a bad email and a wrong code', async () => {
    const user = userEvent.setup();
    renderApp('/login');
    await user.type(await screen.findByLabelText('Email'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Email me a code' }));
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'organizer@eventify.test');
    await user.click(screen.getByRole('button', { name: 'Email me a code' }));
    await user.type(await screen.findByLabelText('Code'), '000000');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText(/That code isn't right/)).toBeInTheDocument();
  });

  it('takes an organizer to their dashboard', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/login');
    await signIn(user, ' Organizer@Eventify.test');
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/organizer');
  });

  it('takes staff to the admin portal', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/login');
    await signIn(user, 'admin@eventify.test');
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/admin');
    expect(await screen.findByText('Naomi Kiptoo')).toBeInTheDocument();
  });

  it('ignores a next link that leaves the site', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/login?next=//evil.example');
    await signIn(user, 'organizer@eventify.test');
    await waitFor(() => expect(router.state.location.pathname).toBe('/organizer'));
  });

  it('signs out from the profile', async () => {
    signInAs('organizer');
    const user = userEvent.setup();
    renderApp('/account');
    const main = screen.getByRole('main');
    expect(await within(main).findByText('Amani Wanjiru')).toBeInTheDocument();
    expect(within(main).getByRole('link', { name: /Dashboard/ })).toHaveAttribute(
      'href',
      '/organizer',
    );
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByText("You're browsing as a guest")).toBeInTheDocument();
  });
});

describe('Who can create events', () => {
  it('sends a guest who opens the create link to sign in', async () => {
    const { router } = renderApp('/organizer/events/new');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sign in to create an event' }),
    ).toBeInTheDocument();
    expect(router.state.location.search).toBe('?next=%2Forganizer%2Fevents%2Fnew&intent=create');
  });

  it('keeps an organizer who is waiting for approval out', async () => {
    signInAs('pendingOrganizer');
    const { router } = renderApp('/organizer/events/new');
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: "We're reviewing Mizizi Art Collective",
      }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/organizer');
    expect(screen.queryByRole('link', { name: /Create/ })).not.toBeInTheDocument();
  });

  it('shows a suspended organizer their dashboard without a create button', async () => {
    signInAs('suspendedOrganizer');
    renderApp('/organizer');
    expect(await screen.findByText('Your organizer account is suspended.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Create event/ })).not.toBeInTheDocument();
  });

  it('refuses to publish for anyone the API has not approved', async () => {
    const draft = { title: 'Nope' };
    const post = (token?: string) =>
      fetch('http://localhost/api/organizer/events', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: JSON.stringify(draft),
      });
    expect((await post()).status).toBe(401);
    signInAs('pendingOrganizer');
    expect((await post(localStorage.getItem('eventify-session')!)).status).toBe(403);
    signInAs('superAdmin');
    expect((await post(localStorage.getItem('eventify-session')!)).status).toBe(403);
  });

  it('takes a new person from applying to publishing once a Super Admin approves', async () => {
    const user = userEvent.setup();
    const first = renderApp('/organizer');
    await user.click((await screen.findAllByRole('link', { name: 'Apply to host' }))[0]!);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'First, verify your email' }),
    ).toBeInTheDocument();
    await signIn(user, 'wambui@example.com', 'Continue');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Apply to host' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send application' }));
    expect(screen.getByText('Enter your name.')).toBeInTheDocument();
    expect(screen.getByText('Choose a city.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Your name'), 'Wambui Njeri');
    await user.type(screen.getByLabelText('Organizer name'), 'Kilele Nights');
    await user.selectOptions(screen.getByLabelText('What best describes you?'), 'Company');
    await user.selectOptions(screen.getByLabelText('Events you mostly host'), 'Music & Arts');
    await user.selectOptions(screen.getByLabelText('City'), 'Nairobi');
    await user.type(
      screen.getByLabelText('Tell us about your events'),
      'Monthly rooftop DJ nights in Westlands, about 200 guests each.',
    );
    await user.click(screen.getByRole('button', { name: 'Send application' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: "We're reviewing Kilele Nights" }),
    ).toBeInTheDocument();
    expect(screen.getByText('eventify.co/kilele-nights')).toBeInTheDocument();
    const applicant = localStorage.getItem('eventify-session')!;
    first.unmount();

    signInAs('superAdmin');
    const admin = renderApp('/admin/approvals');
    await user.click(
      await screen.findByRole('button', { name: 'Approve Kilele Nights as an organizer' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Kilele Nights/ })).not.toBeInTheDocument(),
    );
    admin.unmount();

    localStorage.setItem('eventify-session', applicant);
    renderApp('/organizer');
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(await screen.findByText('No events yet')).toBeInTheDocument();
    const main = screen.getByRole('main');
    expect(within(main).getByRole('link', { name: 'Create your first event' })).toHaveAttribute(
      'href',
      '/organizer/events/new',
    );
  });
});
