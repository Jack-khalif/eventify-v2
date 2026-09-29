import {
  formatMoney,
  formatPhone,
  type OrderView,
  type PaymentFailure,
  type PublicEvent,
} from '@eventify/shared';
import { CircleAlert, Clock, Smartphone } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ErrorState, NotFoundState } from '../../components/PageStates';
import { Button, buttonClass } from '../../components/ui';
import { isNotFound } from '../../lib/api';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { useEvent } from '../event/useEvent';
import { LivePass } from '../tickets/LivePass';
import { PassActions } from '../tickets/PassActions';
import { useTicket } from '../tickets/useTickets';
import type { CheckoutState } from './CheckoutPage';
import { TestModeHint } from './TestModeHint';
import { formatElapsed, useElapsedSeconds } from './useElapsed';
import { useOrder, useOrderAction } from './useOrder';

/** Show "didn't get it?" help once the buyer has waited this long. */
const SLOW_PROMPT_SECONDS = 45;

const METHOD_LABEL = { mpesa: 'M-Pesa', momo: 'MTN MoMo', card: 'card' } as const;

/** Buyer-facing copy for each failure. Not in the design; written in its voice. */
const FAILURES: Record<PaymentFailure, { title: string; body: string }> = {
  insufficient_funds: {
    title: "Your M-Pesa balance wasn't enough",
    body: 'Top up or use a different number, then try again. Your tickets are still held for you.',
  },
  cancelled_by_user: {
    title: 'Payment cancelled on your phone',
    body: 'No money was taken. If that was a mistake, send the prompt again.',
  },
  wrong_pin: {
    title: 'The M-Pesa PIN was wrong',
    body: 'No money was taken. Try again and enter your PIN carefully.',
  },
  timeout: {
    title: "We didn't hear back in time",
    body: 'The prompt expired before it was answered. Make sure your phone is on and unlocked, then try again.',
  },
  unknown: {
    title: "The payment didn't go through",
    body: "No tickets were issued. If money left your account, contact us with the M-Pesa message and we'll sort it out.",
  },
};

/** /e/:slug/checkout/:orderId: waiting for M-Pesa, then success or a way to recover. Survives refresh. */
export function OrderPage() {
  const { slug = '', orderId = '' } = useParams();
  const event = useEvent(slug);
  const order = useOrder(orderId);
  useDocumentTitle(event.data ? `Checkout · ${event.data.title}` : 'Checkout');

  if (event.isPending || order.isPending) {
    return <div aria-busy="true" aria-label="Loading order" className="flex-1" />;
  }
  if (
    isNotFound(event.error) ||
    isNotFound(order.error) ||
    (order.data && event.data && order.data.eventId !== event.data.id)
  ) {
    return (
      <NotFoundState
        title="Order not found"
        message="Check the link, or start again from the event page."
      />
    );
  }
  if (event.isError || order.isError) {
    return (
      <ErrorState onRetry={() => (event.isError ? event.refetch() : order.refetch())}>
        Couldn't check your order. Your payment is safe; try again in a moment.
      </ErrorState>
    );
  }

  const o = order.data;
  const e = event.data;
  switch (o.status) {
    case 'pending':
    case 'awaiting_payment':
      return <Waiting event={e} order={o} />;
    case 'failed':
      return <Failed event={e} order={o} />;
    case 'paid':
      return <Success order={o} />;
    case 'expired':
      return (
        <Closed
          icon={<Clock size={40} />}
          title="Your tickets were released"
          body="We held them for 10 minutes but the payment wasn't completed. Nothing was charged."
          event={e}
        />
      );
    case 'cancelled':
      return (
        <Closed
          icon={<CircleAlert size={40} />}
          title="Order cancelled"
          body="Nothing was charged."
          event={e}
        />
      );
  }
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <section className="mx-auto flex w-full max-w-[520px] flex-1 flex-col items-center justify-center gap-6 px-5 py-10 text-center">
      {children}
    </section>
  );
}

/** Back to the form with the buyer's details kept, after cancelling this order. */
function useChangeDetails(event: PublicEvent, order: OrderView) {
  const navigate = useNavigate();
  const cancel = useOrderAction('cancel');
  const state: CheckoutState = {
    buyer: order.buyer,
    paymentMethod: order.paymentMethod ?? undefined,
  };
  const go = () =>
    navigate(`/e/${event.slug}/checkout?tier=${order.tierId}&qty=${order.quantity}`, {
      replace: true,
      state,
    });
  return {
    run: () => cancel.mutate(order.id, { onSettled: go }),
    isPending: cancel.isPending,
  };
}

function Waiting({ event, order }: { event: PublicEvent; order: OrderView }) {
  const seconds = useElapsedSeconds(order.paymentRequestedAt);
  const retry = useOrderAction('retry');
  const change = useChangeDetails(event, order);
  const total = formatMoney(order.currency, order.totalMinor);
  const method = METHOD_LABEL[order.paymentMethod ?? 'mpesa'];

  return (
    <Centered>
      <div className="relative flex size-[120px] items-center justify-center">
        <div className="absolute inset-0 animate-[ev-pulse_1.8s_ease-out_infinite] rounded-full bg-accent-soft" />
        <div className="relative flex size-[88px] items-center justify-center rounded-full bg-accent text-accent-ink">
          <Smartphone size={40} aria-hidden />
        </div>
      </div>
      <div className="flex max-w-[360px] flex-col gap-2">
        <h1 className="m-0 text-2xl tracking-[-0.02em]">Check your phone to confirm payment</h1>
        <p className="m-0 text-[15px] leading-normal text-muted">
          We sent an {method} prompt to{' '}
          <strong className="text-fg whitespace-nowrap">{formatPhone(order.buyer.phone)}</strong>.
          Enter your PIN to pay {total}.
        </p>
      </div>
      <div
        role="status"
        className="flex items-center gap-2.5 rounded-full border-2 border-hair px-[18px] py-2.5"
      >
        <span className="size-[9px] animate-ev-spin rounded-full bg-accent" aria-hidden />
        <span className="font-mono text-sm font-bold">
          {formatElapsed(seconds)} — waiting for confirmation
        </span>
      </div>
      {seconds >= SLOW_PROMPT_SECONDS && (
        <p className="m-0 max-w-[360px] text-sm text-muted">
          Didn't get it? Check your phone is on, unlocked and has signal, then resend.
        </p>
      )}
      <div className="flex gap-2.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => retry.mutate(order.id)}
          disabled={retry.isPending}
        >
          {retry.isPending ? 'Sending…' : 'Resend prompt'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="border-transparent text-muted"
          onClick={change.run}
          disabled={change.isPending}
        >
          Cancel
        </Button>
      </div>
      <TestModeHint />
    </Centered>
  );
}

function Failed({ event, order }: { event: PublicEvent; order: OrderView }) {
  const copy = FAILURES[order.failureReason ?? 'unknown'];
  const retry = useOrderAction('retry');
  const change = useChangeDetails(event, order);
  return (
    <Centered>
      <div className="flex size-[88px] items-center justify-center rounded-full bg-danger-soft text-danger">
        <CircleAlert size={40} aria-hidden />
      </div>
      <div className="flex max-w-[380px] flex-col gap-2">
        <h1 className="m-0 text-2xl tracking-[-0.02em]">{copy.title}</h1>
        <p className="m-0 text-[15px] leading-normal text-muted">{copy.body}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2.5">
        <Button size="md" onClick={() => retry.mutate(order.id)} disabled={retry.isPending}>
          {retry.isPending
            ? 'Sending…'
            : `Try again · ${formatMoney(order.currency, order.totalMinor)}`}
        </Button>
        <Button variant="outline" size="md" onClick={change.run} disabled={change.isPending}>
          Change details
        </Button>
      </div>
      {retry.error && (
        <p role="alert" className="m-0 text-sm text-danger">
          {retry.error.message}
        </p>
      )}
    </Centered>
  );
}

function Closed({
  icon,
  title,
  body,
  event,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  event: PublicEvent;
}) {
  return (
    <Centered>
      <div className="flex size-[88px] items-center justify-center rounded-full bg-surface-2 text-muted">
        {icon}
      </div>
      <div className="flex max-w-[380px] flex-col gap-2">
        <h1 className="m-0 text-2xl tracking-[-0.02em]">{title}</h1>
        <p className="m-0 text-[15px] text-muted">{body}</p>
      </div>
      <Link
        to={`/e/${event.slug}`}
        className={buttonClass({ className: 'text-accent-ink hover:text-accent-ink' })}
      >
        Start again
      </Link>
    </Centered>
  );
}

/** "You're going!" with the first ticket's Live Pass; other tickets in the order are one tap away. */
function Success({ order }: { order: OrderView }) {
  const [first, ...rest] = order.tickets;
  const pass = useTicket(first?.id ?? '');
  return (
    <section className="mx-auto flex w-full max-w-[520px] flex-1 flex-col items-center gap-[18px] px-5 pt-8 pb-10">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="m-0 text-[26px] tracking-[-0.02em]">You're going! 🎉</h1>
        <p className="m-0 text-[13px] text-muted">
          Sent by SMS and email to{' '}
          <strong className="text-fg whitespace-nowrap">{formatPhone(order.buyer.phone)}</strong>{' '}
          and <strong className="text-fg">{order.buyer.email}</strong>
        </p>
      </div>
      {pass.data ? (
        <LivePass ticket={pass.data} />
      ) : pass.isError ? (
        <ErrorState onRetry={pass.refetch}>
          Couldn't load your pass. Your tickets are confirmed.
        </ErrorState>
      ) : (
        <div
          aria-busy="true"
          aria-label="Loading pass"
          className="h-[480px] w-full max-w-[360px]"
        />
      )}
      {rest.length > 0 && (
        <ul
          aria-label="Other tickets in this order"
          className="m-0 flex w-full max-w-[360px] list-none flex-col gap-2 p-0"
        >
          {rest.map((t, i) => (
            <li key={t.id}>
              <Link
                to={`/t/${t.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border-2 border-hair px-3.5 py-2.5 text-fg no-underline hover:bg-surface"
              >
                <span className="text-sm font-bold">
                  Ticket {i + 2} of {order.tickets.length}
                </span>
                <span className="font-mono text-xs text-muted">{t.code}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {pass.data && <PassActions event={pass.data.event} />}
      {first && (
        <Link to={`/t/${first.id}/delivery`} className="text-[13px] font-bold text-accent-text">
          Preview the SMS &amp; email →
        </Link>
      )}
      <Link to="/" className="text-[13px] text-muted">
        Back to Discover
      </Link>
    </section>
  );
}
