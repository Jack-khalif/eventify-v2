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

const mockSystemDark = (dark: boolean) =>
  vi
    .spyOn(window, 'matchMedia')
    .mockImplementation((query) => ({ matches: dark, media: query }) as MediaQueryList);

describe('theme', () => {
  it('starts dark when nothing is stored, whatever the OS setting', () => {
    mockSystemDark(true);
    expect(initialTheme()).toBe('dark');
    mockSystemDark(false);
    expect(initialTheme()).toBe('dark');
  });

  it('keeps a stored choice', () => {
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
