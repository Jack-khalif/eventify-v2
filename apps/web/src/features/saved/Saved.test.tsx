import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVED_STORAGE_KEY, toggleSaved } from '../../lib/saved';
import { renderApp } from '../../test/render';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-29T10:00:00+03:00'));
});
afterEach(() => vi.useRealTimers());

const sauti = 'Sauti Sessions: Afro-house Listening Night';

describe('Saved', () => {
  it('saves an event from Discover and lists it on the Saved page', async () => {
    const { router } = renderApp('/');
    const upcoming = screen.getByRole('region', { name: 'Upcoming' });
    const save = await within(upcoming).findByRole('button', { name: `Save ${sauti}` });

    await userEvent.click(save);

    // Both cards for this event (weekend rail and grid) update together.
    expect(screen.getAllByRole('button', { name: `Remove ${sauti} from saved` })).toHaveLength(2);
    expect(JSON.parse(localStorage.getItem(SAVED_STORAGE_KEY)!)).toEqual(['evt_sauti']);

    await userEvent.click(
      within(screen.getByRole('navigation', { name: 'Tabs' })).getByRole('link', { name: 'Saved' }),
    );
    expect(router.state.location.pathname).toBe('/saved');
    expect(await screen.findByRole('link', { name: sauti })).toBeInTheDocument();
  });

  it('lists the most recently saved first', async () => {
    toggleSaved('evt_pwani');
    toggleSaved('evt_hack');
    renderApp('/saved');
    await screen.findByRole('link', { name: 'IEEE Strathmore Hackathon 2026' });
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'IEEE Strathmore Hackathon 2026',
      'Pwani Food & Taarab Evening',
    ]);
  });

  it('removes an event when un-saved on the Saved page', async () => {
    toggleSaved('evt_sauti');
    renderApp('/saved');
    await userEvent.click(
      await screen.findByRole('button', { name: `Remove ${sauti} from saved` }),
    );
    expect(await screen.findByText('Nothing saved yet')).toBeInTheDocument();
  });

  it('shows an empty state with a way back to Discover', () => {
    renderApp('/saved');
    expect(screen.getByText('Nothing saved yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Find events' })).toHaveAttribute('href', '/');
  });

  it('picks up changes made in another tab', async () => {
    renderApp('/saved');
    act(() => {
      localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(['evt_jazz']));
      window.dispatchEvent(new StorageEvent('storage', { key: SAVED_STORAGE_KEY }));
    });
    expect(
      await screen.findByRole('link', { name: 'Sunday Jazz at the Arboretum' }),
    ).toBeInTheDocument();
  });

  it('survives corrupted storage', async () => {
    localStorage.setItem(SAVED_STORAGE_KEY, '{not json');
    renderApp('/saved');
    expect(screen.getByText('Nothing saved yet')).toBeInTheDocument();
  });

  it('still works for the visit when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    renderApp('/');
    const upcoming = screen.getByRole('region', { name: 'Upcoming' });
    await userEvent.click(await within(upcoming).findByRole('button', { name: `Save ${sauti}` }));
    await waitFor(() =>
      expect(
        within(upcoming).getByRole('button', { name: `Remove ${sauti} from saved` }),
      ).toHaveAttribute('aria-pressed', 'true'),
    );
  });
});
