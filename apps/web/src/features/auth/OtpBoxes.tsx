import { useEffect, useId, useRef } from 'react';
import { cn } from '../../lib/cn';

const LENGTH = 6;

/**
 * A 6-digit code, one box per digit. Typing moves on to the next box and Backspace steps back; a
 * code pasted or filled in by the phone (even as "482 913") lands across the boxes. `onComplete`
 * fires as soon as all six are in.
 */
export function OtpBoxes({
  label,
  value,
  onChange,
  onComplete,
  error,
}: {
  label: string;
  value: string;
  onChange: (digits: string) => void;
  onComplete?: (digits: string) => void;
  error?: string;
}) {
  const id = useId();
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => boxes.current[0]?.focus(), []);
  // The digits as of the last keystroke: focus moves before the new value has been rendered, and
  // the box being focused needs to know it is no longer past the end.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  const update = (next: string, focus: number) => {
    latest.current = next;
    onChange(next);
    boxes.current[Math.min(focus, LENGTH - 1)]?.focus();
    if (next.length === LENGTH && next !== value) onComplete?.(next);
  };

  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
      <legend className="mb-1.5 p-0 text-[13px] font-semibold text-muted">{label}</legend>
      <div className="grid grid-cols-6 gap-2">
        {Array.from({ length: LENGTH }, (_, i) => (
          <input
            key={i}
            ref={(el) => {
              boxes.current[i] = el;
            }}
            aria-label={`Digit ${i + 1}`}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-msg` : undefined}
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            value={value[i] ?? ''}
            // Digits go in from the left, so a tap further along lands on the first empty box.
            onFocus={(ev) => {
              const filled = latest.current.length;
              if (i > filled) boxes.current[filled]?.focus();
              else ev.target.select();
            }}
            onChange={(ev) => {
              let typed = ev.target.value.replace(/\D/g, '');
              if (!typed) return update(value.slice(0, i), i);
              // The box wasn't selected, so its old digit is still in front of the new one.
              if (typed.length === 2 && typed[0] === value[i]) typed = typed[1]!;
              const next =
                typed.length === 1
                  ? value.slice(0, i) + typed + value.slice(i + 1)
                  : (value.slice(0, i) + typed).slice(0, LENGTH);
              update(next, i + typed.length);
            }}
            onKeyDown={(ev) => {
              if (ev.key === 'Backspace' && !value[i] && i > 0) {
                ev.preventDefault();
                update(value.slice(0, i - 1), i - 1);
              }
            }}
            className={cn(
              'h-14 w-full min-w-0 rounded-lg border-2 border-rule bg-bg text-center font-mono text-xl font-bold text-fg',
              'focus-visible:outline-offset-0 aria-invalid:border-danger',
            )}
          />
        ))}
      </div>
      {error && (
        <span id={`${id}-msg`} className="text-xs font-semibold text-danger">
          {error}
        </span>
      )}
    </fieldset>
  );
}
