import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Buttons row, right-aligned. */
  actions?: ReactNode;
};

export function Dialog({ open, onClose, title, children, actions }: DialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(6,15,17,0.55)] p-4 sm:items-center"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      data-testid="dialog-backdrop"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-2xl border-2 border-rule bg-bg p-5 outline-none"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="m-0 text-xl">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-m-1 cursor-pointer rounded-md p-1 text-muted hover:bg-surface hover:text-fg"
          >
            <X size={18} />
          </button>
        </div>
        <div className="text-sm">{children}</div>
        {actions && <div className="flex flex-wrap justify-end gap-2">{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}
