import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { initialTheme, THEME_STORAGE_KEY, useTheme } from './theme';
import { ThemeProvider } from './ThemeProvider';

function Probe() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button type="button" onClick={toggleTheme}>
      {theme}
    </button>
  );
}

/** What the device says it prefers; null is a device that doesn't say. */
const mockDeviceTheme = (theme: 'light' | 'dark' | null) =>
  vi
    .spyOn(window, 'matchMedia')
    .mockImplementation(
      (query) =>
        ({ matches: theme !== null && query.includes(theme), media: query }) as MediaQueryList,
    );

describe('theme', () => {
  it('follows the device when nothing is stored, and is dark when the device does not say', () => {
    mockDeviceTheme('light');
    expect(initialTheme()).toBe('light');
    mockDeviceTheme('dark');
    expect(initialTheme()).toBe('dark');
    mockDeviceTheme(null);
    expect(initialTheme()).toBe('dark');
  });

  it('prefers a stored choice over the device', () => {
    mockDeviceTheme('dark');
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(initialTheme()).toBe('light');
  });

  it('toggles, sets data-theme on <html> and remembers the choice', async () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(document.documentElement.dataset.theme).toBe('dark');

    await userEvent.click(screen.getByRole('button', { name: 'dark' }));

    expect(screen.getByRole('button')).toHaveTextContent('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('still toggles when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
