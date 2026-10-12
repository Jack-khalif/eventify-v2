import { accounts } from '@eventify/shared/fixtures';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { TEST_PASSWORD, TEST_SIGN_INS } from '../../mocks/testPhones';
import { renderApp } from '../../test/render';
import { signInAs } from '../../test/signIn';

type User = ReturnType<typeof userEvent.setup>;

/** Everyone starts with their email. */
async function enterEmail(user: User, email: string) {
  await user.type(await screen.findByLabelText('Email'), email);
  await user.click(screen.getByRole('button', { name: 'Continue' }));
}

/** Organizers can sign in with a password. */
async function signIn(user: User, email: string, password: string = TEST_PASSWORD) {
  await enterEmail(user, email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

/** Type a code into its six boxes, as a keyboard does: each digit moves on to the next box. */
async function enterCode(user: User, code: string) {
  await user.click(await screen.findByLabelText('Digit 1'));
  await user.keyboard(code);
}

/** Staff sign in with the code sent to their email; the sixth digit sends it. */
async function signInWithCode(user: User, email: string, code = '123456') {
  await enterEmail(user, email);
  await user.click(screen.getByRole('button', { name: 'Email me a code instead' }));
  await enterCode(user, code);
}

describe('Sign in', () => {
  it('offers the sample accounts that exist', () => {
    expect(TEST_SIGN_INS.map((s) => s.email)).toEqual(accounts.map((a) => a.email));
  });

  it('rejects a bad email, a wrong password and a wrong code', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/login');
    await enterEmail(user, 'not-an-email');
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Email'));
    await enterEmail(user, 'organizer@eventify.test');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Password'), 'not the password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText("That email or password isn't right.")).toBeInTheDocument();

    // Staff have no password, even the right-looking one. Going back keeps the address.
    await user.click(screen.getByRole('button', { name: 'Change' }));
    expect(screen.getByLabelText('Email')).toHaveValue('organizer@eventify.test');
    await user.clear(screen.getByLabelText('Email'));
    await signIn(user, 'admin@eventify.test');
    expect(await screen.findByText("That email or password isn't right.")).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Email me a code instead' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Check your email' }),
    ).toBeVisible();
    await enterCode(user, '000000');
    expect(await screen.findByText(/That code isn't right/)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('takes a code pasted with spaces around it', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/login');
    await enterEmail(user, 'admin@eventify.test');
    await user.click(screen.getByRole('button', { name: 'Email me a code instead' }));
    await user.click(await screen.findByLabelText('Digit 1'));
    await user.paste(' 123 456 ');
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin'));
  });

  it('shows the password on request and fills in a picked test account', async () => {
    const user = userEvent.setup();
    renderApp('/login');
    await enterEmail(user, 'organizer@eventify.test');
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');

    await user.click(screen.getByText('Test mode: sample accounts'));
    await user.click(screen.getByRole('button', { name: /Organizer \(approved\)/ }));
    expect(screen.getByLabelText('Password')).toHaveValue(TEST_PASSWORD);
    await user.click(screen.getByRole('button', { name: /Super Admin/ }));
    expect(screen.getByLabelText('Password')).toHaveValue('');
    const card = screen.getByRole('button', { name: 'Change' }).parentElement!;
    expect(card).toHaveTextContent('admin@eventify.test');
  });

  it('takes an organizer to their dashboard', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/login');
    await signIn(user, ' Organizer@Eventify.test');
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/organizer');
  });

  it('lets an organizer who forgot their password choose a new one', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/login');
    await enterEmail(user, 'organizer@eventify.test');
    await user.click(screen.getByRole('button', { name: 'Forgot your password?' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Choose a new password' }),
    ).toBeVisible();

    await user.type(screen.getByLabelText('Code'), '000000');
    await user.type(screen.getByLabelText('New password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Save password and sign in' }));
    expect(screen.getByText('Use at least 8 characters')).toBeInTheDocument();
    await user.type(screen.getByLabelText('New password'), ' but longer');
    await user.click(screen.getByRole('button', { name: 'Save password and sign in' }));
    expect(await screen.findByText(/That code isn't right/)).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Code'));
    await user.type(screen.getByLabelText('Code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Save password and sign in' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/organizer');

    // The old password is gone and the new one works.
    await router.navigate('/account');
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByText("You're browsing as a guest")).toBeInTheDocument();
    await router.navigate('/login');
    await signIn(user, 'organizer@eventify.test');
    expect(await screen.findByText("That email or password isn't right.")).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), 'short but longer');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/organizer'));
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

describe('Deleting a profile', () => {
  /** Open the dialog from the profile and give this password. */
  async function confirmWith(user: User, password: string) {
    await user.click(await screen.findByRole('button', { name: 'Delete profile' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete your profile?' });
    await user.type(within(dialog).getByLabelText('Your password, to confirm'), password);
    await user.click(within(dialog).getByRole('button', { name: 'Delete for good' }));
    return dialog;
  }

  it('asks for the password, then removes the account and signs out', async () => {
    const account = signInAs('pendingOrganizer'); // nobody has a ticket for their event
    const user = userEvent.setup();
    renderApp('/account');

    const dialog = await confirmWith(user, 'not my password');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "That password isn't right.",
    );
    await user.click(within(dialog).getByRole('button', { name: 'Keep profile' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await confirmWith(user, TEST_PASSWORD);
    expect(await screen.findByText("You're browsing as a guest")).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // The account is gone, not just signed out.
    await user.click(within(screen.getByRole('main')).getByRole('link', { name: 'Sign in' }));
    await signIn(user, account.email);
    expect(await screen.findByText("That email or password isn't right.")).toBeInTheDocument();
  });

  it('sends an organizer with tickets out to support, and leaves them signed in', async () => {
    signInAs('organizer');
    const user = userEvent.setup();
    renderApp('/account');
    const dialog = await confirmWith(user, TEST_PASSWORD);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "412 tickets have been issued for your events, so your profile can't be deleted here. Write to support@eventifyafrica.co.ke and we'll help you close it.",
    );
    expect(within(screen.getByRole('main')).getByText('Amani Wanjiru')).toBeInTheDocument();
  });

  it('is not offered to staff', async () => {
    signInAs('agent');
    renderApp('/account');
    expect(await screen.findByRole('link', { name: /Admin portal/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete profile' })).not.toBeInTheDocument();
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

  it('takes a new person from signing up straight to their dashboard, ready to publish', async () => {
    const user = userEvent.setup();
    const first = renderApp('/organizer');
    await user.click(
      (await screen.findAllByRole('link', { name: 'Create an organizer account' }))[0]!,
    );
    // No sign-in wall and no steps: the account, the profile and the terms are one page.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Create your organizer account' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Organizer Terms' })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: 'Privacy Notice' })).toHaveAttribute(
      'href',
      '/privacy',
    );

    // Nothing is ticked for them, and every gap is named.
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText('Enter your name.')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument();
    expect(screen.getByText('Choose a city.')).toBeInTheDocument();
    expect(screen.getByText('Agree to the Organizer Terms to continue.')).toBeInTheDocument();
    expect(screen.getByText('We need your consent to process your details.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Your name'), 'Wambui Njeri');
    await user.type(screen.getByLabelText('Email'), 'Wambui@Example.com');
    await user.type(screen.getByLabelText('Password'), 'rooftop nights');
    await user.type(screen.getByLabelText('Organizer name'), 'Kilele Nights');
    await user.selectOptions(screen.getByLabelText('City'), 'Nairobi');
    expect(screen.getByText(/eventify\.co\/kilele-nights/)).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /agree to the Organizer Terms/ }));
    await user.click(screen.getByRole('checkbox', { name: /I consent to Eventify/ }));
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    // The code we emailed shows the address is theirs; a wrong one says so.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Enter the code' }),
    ).toBeInTheDocument();
    expect(screen.getByText('wambui@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Resend code in \d+s/ })).toBeDisabled();
    await enterCode(user, '000000');
    expect(await screen.findByText(/code isn't right/)).toBeInTheDocument();
    // Backspace walks back through the boxes, and the right code goes straight through.
    await user.keyboard('{Backspace}'.repeat(6));
    expect(screen.getByLabelText('Digit 1')).toHaveFocus();
    await user.keyboard('123456');

    // Nobody reviews them first.
    expect(await screen.findByRole('heading', { level: 1, name: "You're in" })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Go to my dashboard' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(await screen.findByText('No events yet')).toBeInTheDocument();
    first.unmount();

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
