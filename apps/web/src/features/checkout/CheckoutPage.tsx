import {
  availablePaymentMethods,
  buyerSchema,
  formatDate,
  formatMoney,
  normalizePhone,
  tierAvailability,
  type Buyer,
  type PaymentMethod,
  type PublicEvent,
} from '@eventify/shared';
import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { BackLink } from '../../components/BackLink';
import { ErrorState, NotFoundState } from '../../components/PageStates';
import { Button, Cover, Stepper, Tag, TextField } from '../../components/ui';
import { ApiError, isNotFound } from '../../lib/api';
import { cn } from '../../lib/cn';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { useEvent } from '../event/useEvent';
import { useTicketSelection } from '../event/useTicketSelection';
import { TestModeHint } from './TestModeHint';
import { useCreateOrder } from './useOrder';

/** Passed back from the waiting screen's Cancel / Change details, so nothing has to be retyped. */
export type CheckoutState = { buyer?: Buyer; paymentMethod?: PaymentMethod };

const METHODS: { key: PaymentMethod; name: string; note: string; tag: string }[] = [
  { key: 'mpesa', name: 'M-Pesa', note: 'STK push to your phone', tag: 'POPULAR' },
  { key: 'momo', name: 'MTN Mobile Money', note: 'Prompt sent to your phone', tag: 'MOMO' },
  { key: 'card', name: 'Card', note: 'Visa or Mastercard', tag: 'SECONDARY' },
];

export function CheckoutPage() {
  const { slug = '' } = useParams();
  const query = useEvent(slug);
  useDocumentTitle(query.data ? `Checkout · ${query.data.title}` : 'Checkout');

  if (query.isPending) {
    return <div aria-busy="true" aria-label="Loading checkout" className="flex-1" />;
  }
  if (isNotFound(query.error)) {
    return (
      <NotFoundState
        title="Event not found"
        message="It may have been removed, or the link might be wrong."
      />
    );
  }
  if (query.isError)
    return <ErrorState onRetry={query.refetch}>Couldn't load checkout.</ErrorState>;
  return <CheckoutForm event={query.data} />;
}

type FieldErrors = Partial<Record<keyof Buyer, string>>;

function CheckoutForm({ event: e }: { event: PublicEvent }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const restored = (useLocation().state ?? {}) as CheckoutState;
  const selection = useTicketSelection(e, {
    tierId: params.get('tier'),
    quantity: Number(params.get('qty')),
  });

  const [name, setName] = useState(restored.buyer?.name ?? '');
  const [phone, setPhone] = useState(restored.buyer?.phone ?? '');
  const [email, setEmail] = useState(restored.buyer?.email ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const createOrder = useCreateOrder();
  /** Editing a field clears its error straight away. */
  const clearError = (field: keyof Buyer) =>
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));

  const methods = availablePaymentMethods(e.currency);
  const [method, setMethod] = useState<PaymentMethod | null>(
    restored.paymentMethod ?? methods[0] ?? null,
  );
  const isFree = selection.isFree;
  const cannotPay = !isFree && methods.length === 0;
  const phoneCountry = e.currency === 'SSP' ? 'SS' : 'KE';
  const totalLabel = selection.totalLabel;

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const normalizedPhone = normalizePhone(phone, phoneCountry);
    const parsed = buyerSchema.safeParse({
      name,
      phone: normalizedPhone ?? '',
      email: email.trim(),
    });
    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Buyer;
        fieldErrors[key] ??= issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    if (!selection.tier || cannotPay) return;
    createOrder.mutate(
      {
        eventId: e.id,
        tierId: selection.tier.id,
        quantity: selection.quantity,
        buyer: parsed.data,
        paymentMethod: isFree ? null : method,
      },
      { onSuccess: (order) => navigate(`/e/${e.slug}/checkout/${order.id}`) },
    );
  };

  const serverError =
    createOrder.error instanceof ApiError
      ? createOrder.error.message
      : createOrder.error
        ? 'Something went wrong. Check your connection and try again.'
        : null;

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col px-5 pt-4 pb-10">
      <BackLink label="Back to event" fallback={`/e/${e.slug}`} />
      <h1 className="mt-2 mb-5 text-[30px] tracking-[-0.02em]">
        {isFree ? 'Reserve your spot' : 'Checkout'}
      </h1>

      <form noValidate onSubmit={submit} className="flex max-w-[560px] flex-col gap-6">
        <div className="flex gap-3 rounded-2xl border-2 border-rule p-3.5">
          <Cover
            tone={e.coverTone}
            imageUrl={e.coverImageUrl}
            className="size-14 flex-none rounded-md"
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[15px] font-extrabold">{e.title}</span>
            <span className="text-[13px] text-muted">
              {formatDate(e.startsAt)} · {e.venue}
            </span>
            <span className="text-[13px] font-bold text-accent-text">{selection.lineLabel}</span>
          </div>
        </div>

        <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
          <legend className="mb-2.5 p-0 text-base font-extrabold">Ticket &amp; quantity</legend>
          <div className="flex flex-col gap-2">
            {e.tiers.map((t) => {
              const a = tierAvailability(t);
              const disabled = a.status !== 'on_sale';
              const selected = selection.tier?.id === t.id;
              return (
                <label
                  key={t.id}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border-2 p-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-text',
                    selected ? 'border-accent bg-accent-soft' : 'border-hair',
                    disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer',
                  )}
                >
                  <input
                    type="radio"
                    name="tier"
                    className="sr-only"
                    checked={selected}
                    disabled={disabled}
                    onChange={() => selection.selectTier(t.id)}
                  />
                  <span
                    aria-hidden
                    className={cn(
                      'size-4 flex-none rounded-full border-2',
                      selected ? 'border-accent-text bg-accent' : 'border-hair',
                    )}
                  />
                  <span className="flex flex-1 items-center gap-1.5 text-sm font-extrabold">
                    {t.name}
                    {a.status === 'sold_out' && (
                      <Tag tone="neutral" className="px-[7px] py-0.5 text-[10px]">
                        SOLD OUT
                      </Tag>
                    )}
                    {a.status === 'on_sale' && a.lowStock && (
                      <Tag tone="danger" className="px-[7px] py-0.5 text-[10px]">
                        ONLY {a.remaining} LEFT
                      </Tag>
                    )}
                  </span>
                  <span className="text-sm font-extrabold">
                    {a.status === 'sold_out'
                      ? 'Sold out'
                      : t.priceMinor === 0
                        ? 'Free'
                        : formatMoney(e.currency, t.priceMinor)}
                  </span>
                </label>
              );
            })}
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Quantity</span>
              <Stepper
                value={selection.quantity}
                onChange={selection.setQuantity}
                max={selection.maxQuantity}
              />
            </div>
          </div>
        </fieldset>

        <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
          <legend className="mb-3 p-0 text-base font-extrabold">Your details</legend>
          <TextField
            label="Full name"
            placeholder="e.g. Amina Otieno"
            autoComplete="name"
            value={name}
            onChange={(ev) => {
              setName(ev.target.value);
              clearError('name');
            }}
            error={errors.name}
          />
          <div className="flex flex-wrap gap-3">
            <TextField
              label="Phone number"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder={phoneCountry === 'SS' ? '+211 9XX XXX XXX' : '07XX XXX XXX'}
              value={phone}
              onChange={(ev) => {
                setPhone(ev.target.value);
                clearError('phone');
              }}
              error={errors.phone}
              className="flex-[1_1_200px]"
            />
            <TextField
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(ev) => {
                setEmail(ev.target.value);
                clearError('email');
              }}
              error={errors.email}
              className="flex-[1_1_200px]"
            />
          </div>
          <span className="text-xs text-muted">
            Your ticket and QR code are sent here by SMS and email.
          </span>
        </fieldset>

        {!isFree && (
          <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
            <legend className="mb-3 p-0 text-base font-extrabold">Payment method</legend>
            {cannotPay && (
              <p role="note" className="m-0 rounded-xl bg-surface p-3.5 text-sm">
                Online payment for South Sudan events is coming soon with MTN Mobile Money.
              </p>
            )}
            {METHODS.map((m) => {
              const enabled = methods.includes(m.key);
              const selected = enabled && method === m.key;
              return (
                <label
                  key={m.key}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border-2 p-3.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-text',
                    selected ? 'border-accent bg-accent-soft' : 'border-hair',
                    enabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-45',
                  )}
                >
                  <input
                    type="radio"
                    name="method"
                    className="sr-only"
                    checked={selected}
                    disabled={!enabled}
                    onChange={() => setMethod(m.key)}
                  />
                  <span
                    aria-hidden
                    className={cn(
                      'size-[18px] flex-none rounded-full border-2',
                      selected ? 'border-accent-text bg-accent' : 'border-hair',
                    )}
                  />
                  <span className="flex flex-1 flex-col gap-0.5">
                    <span className="text-[15px] font-extrabold">{m.name}</span>
                    <span className="text-xs text-muted">{enabled ? m.note : 'Coming soon'}</span>
                  </span>
                  <Tag shape="square" tone={enabled && m.key === 'mpesa' ? 'accent' : 'neutral'}>
                    {enabled ? m.tag : 'SOON'}
                  </Tag>
                </label>
              );
            })}
          </fieldset>
        )}

        <div className="flex items-center justify-between rounded-xl bg-surface p-4 text-lg font-extrabold">
          <span>Total</span>
          <span>{totalLabel}</span>
        </div>

        {serverError && (
          <p
            role="alert"
            className="m-0 rounded-xl bg-danger-soft p-3.5 text-sm font-semibold text-danger"
          >
            {serverError}
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          block
          disabled={!selection.canBuy || cannotPay || createOrder.isPending}
          className="justify-between"
          aria-label={isFree ? 'Reserve spot' : `Send payment prompt for ${totalLabel}`}
        >
          <span>
            {createOrder.isPending ? 'Sending…' : isFree ? 'Reserve spot' : 'Send payment prompt'}
          </span>
          <span>{isFree ? '→' : `${totalLabel} →`}</span>
        </Button>
        {Object.values(errors).some(Boolean) && (
          <span className="-mt-3 text-[13px] text-danger">
            Enter your name, phone and email to continue.
          </span>
        )}

        {!isFree && !cannotPay && <TestModeHint />}
      </form>
    </div>
  );
}
