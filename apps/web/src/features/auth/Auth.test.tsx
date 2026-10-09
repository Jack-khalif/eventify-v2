import { accounts } from '@eventify/shared/fixtures';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { TEST_PASSWORD, TEST_SIGN_INS } from '../../mocks/testPhones';
import { renderApp } from '../../test/render';
import { signInAs } from '../../test/signIn';

type User = ReturnType<typeof userEvent.setup>;

/** Organizers sign in with a password. */
async function signIn(user: User, email: string, password: string = TEST_PASSWORD) {
  await user.type(await screen.findByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

/** Staff sign in with the code sent to their email. */
async function signInWithCode(user: User, email: string, code = '123456') {
  await user.click(await screen.findByRole('button', { name: /Sign in with an emailed code/ }));
  await user.type(screen.getByLabelText('Email'), email);
  await user.click(screen.getByRole('button', { name: 'Email me a code' }));
  await user.type(await screen.findByLabelText('Code'), code);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('Sign in', () => {
  it('offers the sample accounts that exist', () => {
    expect(TEST_SIGN_INS.map((s) => s.email)).toEqual(accounts.map((a) => a.email));
  });

  it('rejects a bad email, a wrong password and a wrong code', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/login');
    await user.type(await screen.findByLabelText('Email'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Email'));
    await signIn(user, 'organizer@eventify.test', 'not the password');
    expect(await screen.findByText("That email or password isn't right.")).toBeInTheDocument();

    // Staff have no password, even the right-looking one.
    await user.clear(screen.getByLabelText('Email'));
    await user.clear(screen.getByLabelText('Password'));
    await signIn(user, 'admin@eventify.test');
    expect(await screen.findByText("That email or password isn't right.")).toBeInTheDocument();

    await signInWithCode(user, 'organizer@eventify.test', '000000');
    expect(await screen.findByText(/That code isn't right/)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('shows the password on request and fills in a picked test account', async () => {
    const user = userEvent.setup();
    renderApp('/login');
    const password = await screen.findByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');

    await user.click(screen.getByText('Test mode: sample accounts'));
    await user.click(screen.getByRole('button', { name: /Organizer \(approved\)/ }));
    expect(screen.getByLabelText('Email')).toHaveValue('organizer@eventify.test');
    expect(screen.getByLabelText('Password')).toHaveValue(TEST_PASSWORD);
    await user.click(screen.getByRole('button', { name: /Super Admin/ }));
    expect(screen.getByLabelText('Email')).toHaveValue('admin@eventify.test');
    expect(screen.getByRole('button', { name: 'Email me a code' })).toBeInTheDocument();
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
    await signInWithCode(user, 'admin@eventify.test');
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
    await user.click(
      (await screen.findAllByRole('link', { name: 'Create an organizer account' }))[0]!,
    );
    // No sign-in wall: the account and the application are one page.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Create your organizer account' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create account and apply' }));
    expect(screen.getByText('Enter your name.')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument();
    expect(screen.getByText('Choose a city.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Your name'), 'Wambui Njeri');
    await user.type(screen.getByLabelText('Email'), 'Wambui@Example.com');
    await user.type(screen.getByLabelText('Password'), 'rooftop nights');
    await user.type(screen.getByLabelText('Organizer name'), 'Kilele Nights');
    await user.selectOptions(screen.getByLabelText('What best describes you?'), 'Company');
    await user.selectOptions(screen.getByLabelText('Events you mostly host'), 'Music & Arts');
    await user.selectOptions(screen.getByLabelText('City'), 'Nairobi');
    await user.type(
      screen.getByLabelText('Tell us about your events'),
      'Monthly rooftop DJ nights in Westlands, about 200 guests each.',
    );
    // Neither box is ticked for them, and the application won't go without both.
    await user.click(screen.getByRole('button', { name: 'Create account and apply' }));
    expect(screen.getByText('Agree to the Organizer Terms to apply.')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /agree to the Organizer Terms/ }));
    await user.click(screen.getByRole('button', { name: 'Create account and apply' }));
    expect(screen.getByText('We need your consent to process your details.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Privacy Notice' })).toHaveAttribute(
      'href',
      '/privacy',
    );
    await user.click(screen.getByRole('checkbox', { name: /I consent to Eventify/ }));
    await user.click(screen.getByRole('button', { name: 'Create account and apply' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: "We're reviewing Kilele Nights" }),
    ).toBeInTheDocument();
    expect(screen.getByText('eventify.co/kilele-nights')).toBeInTheDocument();
    first.unmount();
    localStorage.removeItem('eventify-session');

    signInAs('superAdmin');
    const admin = renderApp('/admin/approvals');
    await user.click(
      await screen.findByRole('button', { name: 'Approve Kilele Nights as an organizer' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Kilele Nights/ })).not.toBeInTheDocument(),
    );
    admin.unmount();

    // Back another day, signing in with the password they chose.
    localStorage.removeItem('eventify-session');
    renderApp('/login');
    await signIn(user, 'wambui@example.com', 'rooftop nights');
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(await screen.findByText('No events yet')).toBeInTheDocument();
    const main = screen.getByRole('main');
    expect(within(main).getByRole('link', { name: 'Create your first event' })).toHaveAttribute(
      'href',
      '/organizer/events/new',
    );
  });
});
