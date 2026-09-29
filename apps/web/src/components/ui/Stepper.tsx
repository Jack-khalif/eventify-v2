import { Minus, Plus } from 'lucide-react';

type StepperProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label?: string;
};

/** Quantity picker from the ticket aside. */
export function Stepper({ value, onChange, min = 1, max = 10, label = 'Quantity' }: StepperProps) {
  const button =
    'flex h-[38px] w-10 cursor-pointer items-center justify-center text-fg hover:bg-surface disabled:opacity-35';
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex items-center overflow-hidden rounded-lg border-2 border-rule"
    >
      <button
        type="button"
        aria-label="Fewer"
        className={button}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus size={16} strokeWidth={2.4} />
      </button>
      <output aria-live="polite" className="w-9 text-center text-base font-extrabold">
        {value}
      </output>
      <button
        type="button"
        aria-label="More"
        className={button}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus size={16} strokeWidth={2.4} />
      </button>
    </div>
  );
}
