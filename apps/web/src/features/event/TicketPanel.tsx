import {
  ENABLED_PAYMENT_METHODS,
  formatDate,
  formatMoney,
  priceLabel,
  tierAvailability,
  type PaymentMethod,
  type PublicEvent,
  type TicketTier,
} from '@eventify/shared';
import { Link } from 'react-router';
import { buttonClass, Stepper, Tag } from '../../components/ui';
import { cn } from '../../lib/cn';
import type { TicketSelection } from './useTicketSelection';

const PAYMENT_BADGES: { method: PaymentMethod; label: string }[] = [
  { method: 'mpesa', label: 'M-PESA' },
  { method: 'momo', label: 'MTN MOMO' },
  { method: 'card', label: 'Card' },
];

function tierStatus(tier: TicketTier, event: PublicEvent) {
  const a = tierAvailability(tier);
  switch (a.status) {
    case 'sold_out':
      return {
        disabled: true,
        price: 'Sold out',
        badge: { label: 'SOLD OUT', tone: 'neutral' as const },
      };
    case 'not_started':
      return { disabled: true, price: `Opens ${formatDate(a.opensAt)}`, badge: null };
    case 'ended':
      return { disabled: true, price: 'Sales ended', badge: null };
    case 'on_sale':
      return {
        disabled: false,
        price: tier.priceMinor === 0 ? 'Free' : formatMoney(event.currency, tier.priceMinor),
        badge: a.lowStock ? { label: `ONLY ${a.remaining} LEFT`, tone: 'danger' as const } : null,
      };
  }
}

/** The "Tickets" aside from the design: tiers, quantity, total, CTA and accepted payments. */
export function TicketPanel({
  event,
  selection,
}: {
  event: PublicEvent;
  selection: TicketSelection;
}) {
  return (
    <aside
      aria-label="Tickets"
      className="flex w-full flex-[1_1_340px] flex-col self-start overflow-hidden rounded-[20px] border-2 border-rule bg-bg md:sticky md:top-[88px] md:max-w-[440px]"
    >
      <div className="flex items-baseline justify-between gap-3 border-b-2 border-rule px-5 py-[18px]">
        <h2 className="m-0 text-xl">Tickets</h2>
        <span className="text-[13px] text-muted">{priceLabel(event)}</span>
      </div>

      <fieldset className="m-0 flex flex-col gap-2 border-0 p-4">
        <legend className="sr-only">Ticket type</legend>
        {event.tiers.map((t) => {
          const status = tierStatus(t, event);
          const selected = selection.tier?.id === t.id;
          return (
            <label
              key={t.id}
              className={cn(
                'flex items-center gap-3 rounded-xl border-2 p-3.5 text-left transition-colors',
                selected ? 'border-accent bg-accent-soft' : 'border-hair',
                status.disabled
                  ? 'cursor-not-allowed opacity-45'
                  : 'cursor-pointer hover:border-rule',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-text',
              )}
            >
              <input
                type="radio"
                name={`tier-${event.id}`}
                value={t.id}
                checked={selected}
                disabled={status.disabled}
                onChange={() => selection.selectTier(t.id)}
                className="sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  'size-[18px] flex-none rounded-full border-2',
                  selected ? 'border-accent-text bg-accent' : 'border-hair',
                )}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-[15px] font-extrabold">
                  {t.name}
                  {status.badge && (
                    <Tag tone={status.badge.tone} className="px-[7px] py-0.5 text-[10px]">
                      {status.badge.label}
                    </Tag>
                  )}
                </span>
                {t.note && <span className="text-xs text-muted">{t.note}</span>}
              </span>
              <span className="text-right text-[15px] font-extrabold">{status.price}</span>
            </label>
          );
        })}
      </fieldset>

      {selection.canBuy && (
        <>
          <div className="flex items-center justify-between px-5 pb-4">
            <span className="text-sm font-semibold">Quantity</span>
            <Stepper
              value={selection.quantity}
              onChange={selection.setQuantity}
              max={selection.maxQuantity}
            />
          </div>

          <div className="mx-4 flex flex-col gap-2 rounded-xl bg-surface p-4 text-sm">
            <div className="flex justify-between gap-3 text-lg font-extrabold">
              <span>{selection.lineLabel}</span>
              <span>{selection.totalLabel}</span>
            </div>
            <span className="text-xs text-muted">The price you see is the price you pay.</span>
          </div>
        </>
      )}

      <div className="p-4">
        <CheckoutButton selection={selection} size="aside" />
        <div className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Payment methods">
          {PAYMENT_BADGES.map(({ method, label }) =>
            ENABLED_PAYMENT_METHODS.includes(method) ? (
              <Tag key={method} shape="square">
                {label}
              </Tag>
            ) : (
              <Tag key={method} shape="square" tone="outline" title="Coming soon">
                {label} · soon
              </Tag>
            ),
          )}
        </div>
      </div>
    </aside>
  );
}

export function CheckoutButton({
  selection,
  size,
}: {
  selection: TicketSelection;
  size: 'aside' | 'bar';
}) {
  if (!selection.canBuy) {
    return (
      <button
        type="button"
        disabled
        className={buttonClass({ size: 'lg', block: size === 'aside' })}
      >
        Sold out
      </button>
    );
  }
  const label = selection.isFree ? 'Reserve spot' : 'Get tickets';
  return (
    <Link
      to={selection.checkoutPath}
      aria-label={`${label}, ${selection.lineLabel}, ${selection.totalLabel}`}
      className={buttonClass({
        size: 'lg',
        block: size === 'aside',
        className: cn(
          'justify-between text-accent-ink hover:text-accent-ink',
          size === 'bar' && 'min-w-40 px-5 py-[15px]',
        ),
      })}
    >
      <span>{label}</span>
      <span>{size === 'aside' ? `${selection.totalLabel} →` : '→'}</span>
    </Link>
  );
}

/** Mobile-only sticky bar with the running total, replacing the tab bar on event pages. */
export function BuyBar({ selection }: { selection: TicketSelection }) {
  return (
    <div
      data-testid="buy-bar"
      className="sticky bottom-0 z-30 flex items-center gap-3 border-t-2 border-rule bg-bg px-4 pt-3 pb-[max(18px,env(safe-area-inset-bottom))] md:hidden"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs text-muted">
          {selection.canBuy ? selection.lineLabel : 'No tickets available'}
        </span>
        <span className="text-lg font-extrabold">
          {selection.canBuy ? selection.totalLabel : '—'}
        </span>
      </div>
      <CheckoutButton selection={selection} size="bar" />
    </div>
  );
}
