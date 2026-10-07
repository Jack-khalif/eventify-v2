import { cn } from '../../lib/cn';

type SegmentedProps<T extends string> = {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

/** Two-to-four option switch, e.g. the admin date ranges and currency switch. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex overflow-hidden rounded-md border-2 border-rule"
    >
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(o.value)}
            className={cn(
              'cursor-pointer px-3 py-1.5 text-[13px] font-semibold [&+&]:border-l-2 [&+&]:border-rule',
              checked ? 'bg-fg text-bg' : 'hover:bg-surface',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
