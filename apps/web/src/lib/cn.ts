import { extendTailwindMerge } from 'tailwind-merge';

/** Teach twMerge our token colour names so it can tell text-muted (colour) from text-sm (size). */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: [
        'bg',
        'surface',
        'surface-2',
        'fg',
        'muted',
        'rule',
        'hair',
        'accent',
        'accent-hover',
        'accent-ink',
        'accent-text',
        'accent-soft',
        'card-date',
        'danger',
        'danger-soft',
        'good',
        'good-soft',
        'white',
        'transparent',
        'current',
      ],
    },
  },
});

/** Join class names, skipping falsy values. Later classes override earlier conflicting ones (justify-between beats justify-center). */
export const cn = (...classes: Array<string | false | null | undefined>) =>
  twMerge(classes.filter(Boolean).join(' '));
