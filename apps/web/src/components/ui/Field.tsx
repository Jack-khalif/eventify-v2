import {
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '../../lib/cn';

const control =
  'w-full rounded-lg border-2 border-rule bg-bg px-3.5 text-[15px] text-fg placeholder:text-muted/70 ' +
  'focus-visible:outline-offset-0 aria-invalid:border-danger disabled:opacity-45';

type FieldProps = { label: string; hint?: ReactNode; error?: string; className?: string };

/** Label + control + hint/error, laid out like the checkout form. */
function FieldShell({
  id,
  label,
  hint,
  error,
  className,
  children,
}: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-semibold text-muted">
        {label}
      </label>
      {children}
      {error ? (
        <span id={`${id}-msg`} className="text-xs font-semibold text-danger">
          {error}
        </span>
      ) : hint ? (
        <span id={`${id}-msg`} className="text-xs text-muted">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

const describedBy = (id: string, props: FieldProps) =>
  props.error || props.hint ? `${id}-msg` : undefined;

export function TextField({
  label,
  hint,
  error,
  className,
  ...input
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, { label, hint, error })}
        className={cn(control, 'h-12')}
        {...input}
      />
    </FieldShell>
  );
}

/** A password box with a Show/Hide switch, so a mistyped one can be checked on a phone. */
export function PasswordField({
  label,
  hint,
  error,
  className,
  ...input
}: FieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, { label, hint, error })}
          className={cn(control, 'h-12 pr-16')}
          {...input}
        />
        <button
          type="button"
          aria-pressed={visible}
          aria-label="Show password"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 cursor-pointer rounded-r-lg px-3.5 text-[13px] font-extrabold text-muted hover:text-fg"
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
    </FieldShell>
  );
}

export function SelectField({
  label,
  hint,
  error,
  className,
  children,
  ...select
}: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, { label, hint, error })}
        className={cn(control, 'h-12 cursor-pointer font-semibold')}
        {...select}
      >
        {children}
      </select>
    </FieldShell>
  );
}

export function TextAreaField({
  label,
  hint,
  error,
  className,
  ...textarea
}: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, { label, hint, error })}
        className={cn(control, 'min-h-28 resize-y py-3')}
        {...textarea}
      />
    </FieldShell>
  );
}

/** A tick box with its sentence beside it. The label may hold links. */
export function CheckboxField({
  label,
  error,
  className,
  ...input
}: {
  label: ReactNode;
  error?: string;
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-msg` : undefined}
          className="mt-0.5 size-5 flex-none cursor-pointer accent-accent"
          {...input}
        />
        <label htmlFor={id} className="cursor-pointer text-[15px]">
          {label}
        </label>
      </div>
      {error && (
        <span id={`${id}-msg`} className="pl-8 text-xs font-semibold text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
