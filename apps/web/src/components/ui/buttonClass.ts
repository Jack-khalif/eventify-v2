import { cn } from '../../lib/cn';

export type ButtonVariant = 'primary' | 'ink' | 'outline' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const variants: Record<ButtonVariant, string> = {
  /** Cyan CTA: "Get tickets", "Send payment prompt". */
  primary: 'bg-accent text-accent-ink hover:bg-accent-hover',
  /** Dark CTA: "Create an event →". */
  ink: 'bg-accent-ink text-white hover:opacity-90',
  /** Bordered: header "Create event", secondary actions. */
  outline: 'border-2 border-rule text-fg hover:bg-surface',
  /** Quiet: icon buttons, "Cancel". */
  ghost: 'border border-hair text-fg hover:bg-surface',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'rounded-md px-3.5 py-2 text-sm',
  md: 'rounded-lg px-4 py-3 text-[15px]',
  lg: 'rounded-xl px-[18px] py-4 text-base',
  icon: 'rounded-md size-9 p-0',
};

/** Shared with links that look like buttons: <Link className={buttonClass({ variant: 'ink' })}>. */
export function buttonClass({
  variant = 'primary',
  size = 'md',
  block = false,
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; className?: string } = {}) {
  return cn(
    'inline-flex items-center justify-center gap-2 font-extrabold leading-tight no-underline transition-colors',
    'cursor-pointer disabled:opacity-45 disabled:pointer-events-none',
    variants[variant],
    sizes[size],
    block && 'w-full',
    className,
  );
}
