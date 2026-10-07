import type { SessionUser } from '@eventify/shared';
import { Check } from 'lucide-react';
import { Link } from 'react-router';
import { Button, buttonClass, Card, Tag } from '../../components/ui';
import { cn } from '../../lib/cn';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { useSession } from '../auth/useSession';

type Organizer = NonNullable<SessionUser['organizer']>;

const STEPS = ['Application sent', 'Review by our team', 'Create your first event'];

/** /organizer while an application is waiting, or after it was declined. */
export function ApplicationStatus({ organizer }: { organizer: Organizer }) {
  const declined = organizer.status === 'rejected';
  useDocumentTitle(declined ? 'Application declined' : 'Application in review');
  const session = useSession();

  if (declined) {
    return (
      <section className="mx-auto flex w-full max-w-[640px] flex-1 flex-col items-start gap-4 px-5 pt-8 pb-12">
        <Tag tone="neutral">Not approved</Tag>
        <h1 className="m-0 text-[32px] leading-[1.05] tracking-[-0.02em] text-balance">
          We couldn't approve {organizer.name} yet
        </h1>
        <p className="m-0 text-muted">
          This usually means we couldn't confirm who runs the events or what they are. Add more
          detail and send it again, and a person on our team will take another look.
        </p>
        <Link
          to="/organizer/apply"
          className={buttonClass({ className: 'text-accent-ink hover:text-accent-ink' })}
        >
          Update and apply again
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-[640px] flex-1 flex-col items-start gap-5 px-5 pt-8 pb-12">
      <Tag tone="accent">In review</Tag>
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-[32px] leading-[1.05] tracking-[-0.02em] text-balance">
          We're reviewing {organizer.name}
        </h1>
        <p className="m-0 text-muted">
          A person on our team checks every organizer before they can publish. This usually takes
          one working day, and we'll text you as soon as it's done.
        </p>
      </div>

      <Card className="w-full p-5">
        <ol className="m-0 flex list-none flex-col gap-4 p-0">
          {STEPS.map((label, i) => {
            const done = i === 0;
            const current = i === 1;
            return (
              <li
                key={label}
                aria-current={current ? 'step' : undefined}
                className="flex items-center gap-3"
              >
                <span
                  className={cn(
                    'flex size-7 flex-none items-center justify-center rounded-full text-xs font-extrabold',
                    done && 'bg-accent text-accent-ink',
                    current && 'border-2 border-rule',
                    !done && !current && 'border-2 border-hair text-muted',
                  )}
                >
                  {done ? <Check size={15} strokeWidth={3} aria-hidden /> : i + 1}
                </span>
                <span
                  className={cn('text-[15px]', current ? 'font-extrabold' : !done && 'text-muted')}
                >
                  {label}
                  {done && <span className="sr-only"> (done)</span>}
                </span>
              </li>
            );
          })}
        </ol>
      </Card>

      <p className="m-0 text-sm text-muted">
        Until then you can't create events. Your page will be{' '}
        <strong className="text-fg">eventify.co/{organizer.handle}</strong> once you're approved.
      </p>

      <div className="flex flex-wrap gap-2.5">
        <Button variant="outline" disabled={session.isFetching} onClick={() => session.refetch()}>
          {session.isFetching ? 'Checking…' : 'Check again'}
        </Button>
        <Link to="/" className={buttonClass({ variant: 'ghost', className: 'border-transparent' })}>
          Browse events
        </Link>
      </div>
    </section>
  );
}
