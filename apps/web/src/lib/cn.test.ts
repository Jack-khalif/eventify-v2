import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('drops falsy values', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
  });

  it('lets later classes override conflicting earlier ones', () => {
    expect(cn('justify-center px-4', 'justify-between')).toBe('px-4 justify-between');
  });

  it('knows the design token colours, so text size and text colour both survive', () => {
    expect(cn('text-sm text-muted', 'text-fg')).toBe('text-sm text-fg');
    expect(cn('bg-accent', 'bg-accent-ink')).toBe('bg-accent-ink');
  });
});
