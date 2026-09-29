import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Button, buttonClass } from './ui';

/** Full-page "not found" for a missing event or organizer. */
export function NotFoundState({ title, message }: { title: string; message: string }) {
  return (
    <section className="mx-auto flex w-full max-w-[1240px] flex-col items-start gap-4 px-5 py-12">
      <h1 className="m-0 text-4xl md:text-6xl">{title}</h1>
      <p className="m-0 text-muted">{message}</p>
      <Link
        to="/"
        className={buttonClass({ size: 'md', className: 'text-accent-ink hover:text-accent-ink' })}
      >
        Find events
      </Link>
    </section>
  );
}

export function ErrorState({ onRetry, children }: { onRetry: () => unknown; children: ReactNode }) {
  return (
    <section
      role="alert"
      className="mx-auto flex w-full max-w-[1240px] flex-wrap items-center gap-3 px-5 py-12"
    >
      <span>{children}</span>
      <Button variant="outline" size="sm" onClick={() => onRetry()}>
        Retry
      </Button>
    </section>
  );
}
