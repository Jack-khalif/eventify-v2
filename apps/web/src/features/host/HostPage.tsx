import { DEFAULT_RATE_BPS, formatRate, isStaff, type SessionUser } from '@eventify/shared';
import { BadgeCheck, ClipboardList, Rocket, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { buttonClass, Card } from '../../components/ui';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { NoAccess } from '../auth/guards';
import { loginPath } from '../auth/roles';

const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: ClipboardList,
    title: 'Create your account',
    body: 'Tell us who you are and what you host. It takes about two minutes.',
  },
  {
    icon: BadgeCheck,
    title: 'We review',
    body: 'A person on our team checks every organizer, usually within one working day.',
  },
  {
    icon: Rocket,
    title: 'Publish and sell',
    body: 'Once approved, create events, take M-Pesa payments and scan guests in at the door.',
  },
];

/**
 * /organizer for anyone who isn't an organizer yet: what hosting involves and the way in.
 * There is no "create event" here on purpose: publishing opens only after approval.
 */
export function HostPage({ user }: { user: SessionUser | null }) {
  useDocumentTitle('Host an event');

  if (user && isStaff(user.role)) {
    return (
      <NoAccess
        title="Organizer tools are for organizer accounts"
        action={
          <Link
            to="/admin"
            className={buttonClass({ className: 'text-accent-ink hover:text-accent-ink' })}
          >
            Open the admin portal
          </Link>
        }
      >
        You're signed in as Eventify staff. To see an organizer's sales or events, find them in the
        admin portal.
      </NoAccess>
    );
  }

  const applyTo = '/organizer/apply';
  const applyLabel = user ? 'Apply to host' : 'Create an organizer account';

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-10 px-5 pt-8 pb-14">
      <section className="flex flex-col items-start gap-4">
        <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-extrabold text-accent-text">
          For organizers
        </span>
        <h1 className="m-0 max-w-[720px] text-4xl leading-[1.04] tracking-[-0.02em] text-balance md:text-6xl">
          Sell tickets to your event on Eventify
        </h1>
        <p className="m-0 max-w-[600px] text-[17px] text-muted">
          M-Pesa checkout, tickets by SMS and email, and queue-free Express Entry at the door. We
          approve every organizer before they can publish, so buyers know the events here are real.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to={applyTo}
            className={buttonClass({
              size: 'lg',
              className: 'text-accent-ink hover:text-accent-ink',
            })}
          >
            {applyLabel}
          </Link>
          {!user && (
            <Link to={loginPath('/organizer')} className="text-sm font-bold">
              Already an organizer? Sign in
            </Link>
          )}
        </div>
      </section>

      <section aria-labelledby="how-hosting-works" className="flex flex-col gap-4">
        <h2 id="how-hosting-works" className="m-0 text-xl">
          How it works
        </h2>
        <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4 p-0">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <li key={title}>
              <Card className="flex h-full flex-col gap-2.5 p-5">
                <span className="flex items-center gap-2.5">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-ink">
                    <Icon size={18} aria-hidden />
                  </span>
                  <span className="text-xs font-extrabold tracking-[0.08em] text-muted uppercase">
                    Step {i + 1}
                  </span>
                </span>
                <span className="text-lg font-extrabold">{title}</span>
                <span className="text-sm text-muted">{body}</span>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <Card variant="surface" className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex max-w-[620px] flex-col gap-1">
          <span className="font-extrabold">
            {formatRate(DEFAULT_RATE_BPS)} of ticket sales. Nothing up front.
          </span>
          <span className="text-sm text-muted">
            The fee comes out of your payout, so buyers pay exactly the price you set. Payouts go to
            M-Pesa or your bank every week.
          </span>
        </div>
        <Link to={applyTo} className={buttonClass({ variant: 'outline', className: 'text-fg' })}>
          {applyLabel}
        </Link>
      </Card>
    </div>
  );
}
