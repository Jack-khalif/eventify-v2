import {
  CATEGORIES,
  CATEGORY_TONE,
  CITIES,
  CITY_CURRENCY,
  CURRENCY_LABEL,
  detailsErrors,
  draftPriceLabel,
  draftToRequest,
  emptyEventDraft,
  eventTimes,
  formatDate,
  formatRate,
  formatTimeRange,
  hasErrors,
  MAX_TIERS,
  newTierDraft,
  presetTier,
  TIER_PRESETS,
  tierPayout,
  tiersErrors,
  toEatIso,
  type Category,
  type City,
  type EventDraft,
  type PublicEvent,
  type TierDraft,
} from '@eventify/shared';
import { Check, ImagePlus, Trash2 } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import { Link } from 'react-router';
import { BackLink } from '../../components/BackLink';
import {
  Button,
  buttonClass,
  Chip,
  Cover,
  SelectField,
  TextAreaField,
  TextField,
} from '../../components/ui';
import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { useCreateEvent, useOrganizerHome } from '../dashboard/useDashboard';
import { ShareLinks } from '../event/ShareBlock';
import { MAX_POSTER_BYTES, readPoster } from './poster';

const STEPS = ['Details', 'Tickets', 'Publish'] as const;
type Step = 1 | 2 | 3;

export function CreateEventPage() {
  useDocumentTitle('Create event');
  const rateBps = useOrganizerHome().data?.organizer.rateBps;
  const [draft, setDraft] = useState<EventDraft>(emptyEventDraft);
  const [step, setStep] = useState<Step>(1);
  /** Errors only show once the organizer has tried to continue from that step. */
  const [attempted, setAttempted] = useState<Record<Step, boolean>>({
    1: false,
    2: false,
    3: false,
  });
  const create = useCreateEvent();

  const details = detailsErrors(draft);
  const tiers = tiersErrors(draft);
  const update = (patch: Partial<EventDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const goTo = (next: Step) => {
    setStep(next);
    window.scrollTo?.(0, 0);
  };
  const next = () => {
    const blocked = step === 1 ? hasErrors(details) : hasErrors(tiers);
    setAttempted((a) => ({ ...a, [step]: true }));
    if (!blocked) goTo((step + 1) as Step);
  };
  const publish = () => {
    // A step's rules can go stale if the organizer waits (a start time slips into the past).
    if (hasErrors(details)) return goTo(1);
    if (hasErrors(tiers)) return goTo(2);
    create.mutate(draftToRequest(draft));
  };

  if (create.data) return <Published event={create.data} />;

  const serverError =
    create.error instanceof ApiError
      ? create.error.message
      : create.error
        ? "Couldn't publish. Check your connection and try again."
        : null;

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5 px-5 pt-5 pb-12">
      <BackLink label="Dashboard" fallback="/organizer" />
      <h1 className="m-0 text-[28px] tracking-[-0.02em]">Create event</h1>

      <ol aria-label="Steps" className="m-0 flex list-none gap-1.5 p-0">
        {STEPS.map((label, i) => {
          const reached = step >= i + 1;
          return (
            <li
              key={label}
              aria-current={step === i + 1 ? 'step' : undefined}
              className="flex flex-1 flex-col gap-1.5"
            >
              <span className={cn('h-1.5 rounded', reached ? 'bg-accent' : 'bg-hair')} />
              <span className={cn('text-xs font-bold', reached ? 'text-fg' : 'text-muted')}>
                {label}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-start gap-8">
        <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-5">
          {step === 1 && (
            <DetailsStep draft={draft} update={update} errors={attempted[1] ? details : {}} />
          )}
          {step === 2 && (
            <TicketsStep
              draft={draft}
              setDraft={setDraft}
              errors={attempted[2] ? tiers : {}}
              rateBps={rateBps}
            />
          )}
          {step === 3 && <ReviewStep draft={draft} rateBps={rateBps} />}

          {serverError && step === 3 && (
            <p
              role="alert"
              className="m-0 rounded-xl bg-danger-soft p-3.5 text-sm font-semibold text-danger"
            >
              {serverError}
            </p>
          )}
          {step === 3 && (
            <Button size="lg" block onClick={publish} disabled={create.isPending}>
              {create.isPending ? 'Publishing…' : 'Publish event'}
            </Button>
          )}

          <div className="flex justify-between gap-2.5 border-t-2 border-hair pt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={step === 1}
              onClick={() => goTo((step - 1) as Step)}
            >
              Back
            </Button>
            {step < 3 && (
              <Button
                size="sm"
                className="bg-fg text-bg hover:bg-fg hover:opacity-85"
                onClick={next}
              >
                Continue
              </Button>
            )}
          </div>
          {attempted[step] && step < 3 && hasErrors(step === 1 ? details : tiers) && (
            <span role="status" className="-mt-3 text-[13px] text-danger">
              Fix the highlighted fields to continue.
            </span>
          )}
        </div>

        <LivePreview draft={draft} />
      </div>
    </div>
  );
}

type DetailsProps = {
  draft: EventDraft;
  update: (patch: Partial<EventDraft>) => void;
  errors: ReturnType<typeof detailsErrors>;
};

function DetailsStep({ draft, update, errors }: DetailsProps) {
  const [posterError, setPosterError] = useState<string | null>(null);
  const [today] = useState(() => toEatIso(Date.now()).slice(0, 10));

  const onPoster = async (ev: ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return setPosterError('Choose an image file.');
    if (file.size > MAX_POSTER_BYTES) return setPosterError('Choose an image under 10 MB.');
    try {
      update({ coverImageUrl: await readPoster(file) });
      setPosterError(null);
    } catch {
      setPosterError("Couldn't read that image. Try a JPG or PNG.");
    }
  };

  return (
    <div className="flex flex-col gap-3.5">
      <TextField
        label="Event title"
        placeholder="e.g. Sunset Rooftop Sessions"
        value={draft.title}
        maxLength={120}
        onChange={(e) => update({ title: e.target.value })}
        error={errors.title}
      />
      <div className="flex flex-wrap gap-3">
        <SelectField
          label="Category"
          value={draft.category}
          onChange={(e) => update({ category: e.target.value as Category })}
          className="flex-[1_1_180px]"
        >
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </SelectField>
        <SelectField
          label="City"
          value={draft.city}
          onChange={(e) => update({ city: e.target.value as City })}
          className="flex-[1_1_140px]"
        >
          {CITIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </SelectField>
      </div>
      <TextField
        label="Venue or online link"
        placeholder="e.g. Nyakuron Cultural Centre, or a meeting link"
        value={draft.venue}
        onChange={(e) => update({ venue: e.target.value })}
        error={errors.venue}
      />
      <div className="flex flex-wrap gap-3">
        <TextField
          label="Date"
          type="date"
          min={today}
          value={draft.date}
          onChange={(e) => update({ date: e.target.value })}
          error={errors.date}
          className="flex-[1_1_160px]"
        />
        <TextField
          label="Starts"
          type="time"
          value={draft.startTime}
          onChange={(e) => update({ startTime: e.target.value })}
          error={errors.startTime}
          className="flex-[1_1_120px]"
        />
        <TextField
          label="Ends"
          type="time"
          value={draft.endTime}
          onChange={(e) => update({ endTime: e.target.value })}
          error={errors.endTime}
          hint={
            draft.startTime && draft.endTime && draft.endTime <= draft.startTime
              ? 'Ends the next day'
              : undefined
          }
          className="flex-[1_1_120px]"
        />
      </div>
      <span className="-mt-1.5 text-xs text-muted">Times are East Africa Time (EAT).</span>
      <TextAreaField
        label="Description"
        placeholder="What should people know before they come? Leave a blank line between paragraphs."
        value={draft.description}
        onChange={(e) => update({ description: e.target.value })}
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-muted">Event poster</span>
        <div className="flex flex-wrap items-end gap-3">
          <label className="relative flex aspect-[3/4] w-[180px] cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-[14px] border-2 border-dashed border-hair p-3 text-center text-[13px] text-muted hover:bg-surface has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-text">
            {draft.coverImageUrl ? (
              <Cover
                tone={CATEGORY_TONE[draft.category]}
                imageUrl={draft.coverImageUrl}
                alt="Your poster"
                className="absolute inset-0 rounded-none"
              />
            ) : (
              <>
                <ImagePlus size={28} aria-hidden />
                Click to upload a poster
              </>
            )}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label={draft.coverImageUrl ? 'Replace poster' : 'Upload poster'}
              onChange={onPoster}
            />
          </label>
          {draft.coverImageUrl && (
            <Button variant="ghost" size="sm" onClick={() => update({ coverImageUrl: null })}>
              Remove poster
            </Button>
          )}
        </div>
        {posterError ? (
          <span role="alert" className="text-xs font-semibold text-danger">
            {posterError}
          </span>
        ) : (
          <span className="text-xs text-muted">
            Portrait, square or landscape all work: the whole poster is shown, never cropped.
          </span>
        )}
      </div>
    </div>
  );
}

type TicketsProps = {
  draft: EventDraft;
  setDraft: (fn: (d: EventDraft) => EventDraft) => void;
  errors: ReturnType<typeof tiersErrors>;
  rateBps: number | undefined;
};

function TicketsStep({ draft, setDraft, errors, rateBps }: TicketsProps) {
  const currency = CURRENCY_LABEL[CITY_CURRENCY[draft.city]];
  const setTiers = (fn: (tiers: TierDraft[]) => TierDraft[]) =>
    setDraft((d) => ({ ...d, tiers: fn(d.tiers) }));
  const updateTier = (key: string, patch: Partial<TierDraft>) =>
    setTiers((ts) => ts.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  const digits = (v: string) => v.replace(/[^0-9]/g, '');
  const full = draft.tiers.length >= MAX_TIERS;

  const togglePreset = (name: (typeof TIER_PRESETS)[number]) =>
    setTiers((ts) =>
      ts.some((t) => t.name === name)
        ? ts.length > 1
          ? ts.filter((t) => t.name !== name)
          : ts
        : // Replace an untouched blank tier rather than leaving it behind.
          [...ts.filter((t) => t.name.trim() || t.price), presetTier(name)],
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-muted">
          Toggle on preset tiers, or add your own
        </span>
        <div className="flex flex-wrap gap-2">
          {TIER_PRESETS.map((name) => {
            const on = draft.tiers.some((t) => t.name === name);
            return (
              <Chip
                key={name}
                active={on}
                disabled={!on && full}
                onClick={() => togglePreset(name)}
                className="h-9 px-3.5 text-[13px] font-bold"
              >
                {name}
              </Chip>
            );
          })}
        </div>
      </div>

      {draft.tiers.map((t, i) => {
        const e = errors[t.key] ?? {};
        const payout = rateBps === undefined ? null : tierPayout(draft, t, rateBps);
        return (
          <fieldset
            key={t.key}
            className="m-0 flex min-w-0 flex-col gap-2.5 rounded-[14px] border-2 border-hair p-3.5"
          >
            <legend className="sr-only">Tier {i + 1}</legend>
            <div className="flex flex-wrap items-start gap-2.5">
              <TextField
                label="Tier name"
                value={t.name}
                onChange={(ev) => updateTier(t.key, { name: ev.target.value })}
                error={e.name}
                className="flex-[1_1_140px]"
              />
              <TextField
                label={`Price (${currency})`}
                inputMode="numeric"
                placeholder="0"
                value={t.price}
                onChange={(ev) => updateTier(t.key, { price: digits(ev.target.value) })}
                error={e.price}
                className="flex-[1_1_100px]"
              />
              <TextField
                label="Quantity"
                inputMode="numeric"
                placeholder="No limit"
                value={t.quantity}
                onChange={(ev) => updateTier(t.key, { quantity: digits(ev.target.value) })}
                error={e.quantity}
                className="flex-[1_1_90px]"
              />
              <button
                type="button"
                aria-label={`Remove ${t.name.trim() || `tier ${i + 1}`}`}
                disabled={draft.tiers.length === 1}
                onClick={() => setTiers((ts) => ts.filter((x) => x.key !== t.key))}
                className="mt-[26px] flex size-12 flex-none cursor-pointer items-center justify-center rounded-lg border-2 border-hair text-danger hover:bg-surface disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Trash2 size={16} aria-hidden />
              </button>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <TextField
                label="Sale starts"
                type="datetime-local"
                value={t.saleStartsAt}
                onChange={(ev) => updateTier(t.key, { saleStartsAt: ev.target.value })}
                hint={t.saleStartsAt ? undefined : 'Blank = on sale now'}
                className="flex-[1_1_180px]"
              />
              <TextField
                label="Sale ends"
                type="datetime-local"
                value={t.saleEndsAt}
                onChange={(ev) => updateTier(t.key, { saleEndsAt: ev.target.value })}
                error={e.saleEndsAt}
                hint={t.saleEndsAt ? undefined : 'Blank = until the event'}
                className="flex-[1_1_180px]"
              />
            </div>
            {payout && (
              <span className="text-xs text-muted">
                You'll receive <strong className="text-fg">{payout.payout}</strong> per ticket ·
                Eventify fee {payout.fee}
              </span>
            )}
          </fieldset>
        );
      })}

      <button
        type="button"
        disabled={full}
        onClick={() => setTiers((ts) => [...ts, newTierDraft()])}
        className="cursor-pointer self-start rounded-lg border-2 border-dashed border-hair px-3.5 py-2.5 text-sm font-extrabold text-fg hover:bg-surface disabled:cursor-not-allowed disabled:opacity-45"
      >
        {full ? `Up to ${MAX_TIERS} tiers` : '+ Add custom tier'}
      </button>
    </div>
  );
}

function ReviewStep({ draft, rateBps }: { draft: EventDraft; rateBps: number | undefined }) {
  const times = eventTimes(draft);
  const paid = draft.tiers.some((t) => Number(t.price) > 0);
  const rows: [string, string][] = [
    ['Title', draft.title.trim()],
    ['Category', draft.category],
    ['Where', `${draft.venue.trim()}, ${draft.city}`],
    [
      'When',
      times
        ? `${formatDate(times.startsAt)} · ${formatTimeRange(times.startsAt, times.endsAt)}`
        : '',
    ],
    [
      'Ticket tiers',
      draft.tiers.map((t) => `${t.name.trim()} (${Number(t.price) ? t.price : 'Free'})`).join(', '),
    ],
    [
      'Your payout',
      !paid
        ? 'Free event, no fees'
        : rateBps === undefined
          ? 'Ticket price minus your Eventify rate'
          : `Ticket price minus your ${formatRate(rateBps)} Eventify rate, paid out weekly`,
    ],
  ];
  return (
    <div className="flex flex-col gap-4">
      <span className="text-sm text-muted">Check everything before it goes live.</span>
      <dl className="m-0 flex flex-col gap-2.5 rounded-[14px] border-2 border-rule p-4">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5">
            <dt className="text-muted">{label}</dt>
            <dd className="m-0 text-right font-bold">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function LivePreview({ draft }: { draft: EventDraft }) {
  const times = eventTimes(draft);
  return (
    <aside
      aria-label="Live preview"
      className="flex w-full max-w-[320px] flex-[1_1_280px] flex-col gap-2.5 md:sticky md:top-[88px]"
    >
      <span className="text-[13px] font-bold text-muted">Live preview</span>
      <div className="flex flex-col gap-3 rounded-2xl border-2 border-rule p-3.5">
        <Cover
          tone={CATEGORY_TONE[draft.category]}
          imageUrl={draft.coverImageUrl}
          className="aspect-[4/3] rounded-xl"
        >
          <span className="absolute top-2.5 left-2.5 rounded-md bg-card-date px-2 py-[5px] text-[9px] font-extrabold tracking-[0.1em] text-accent-text uppercase">
            {draft.city}
          </span>
        </Cover>
        <div className="flex flex-col gap-[3px]">
          <span className="text-[11px] font-extrabold tracking-[0.08em] text-accent-text uppercase">
            {draft.category}
          </span>
          <span className="text-base leading-[1.2] font-extrabold">
            {draft.title.trim() || 'Your event title'}
          </span>
          <span className="text-xs text-muted">
            {times ? formatDate(times.startsAt) : 'Date'} · {draft.venue.trim() || 'Venue'}
          </span>
          <span className="mt-0.5 text-sm font-extrabold text-accent-text">
            {draftPriceLabel(draft)}
          </span>
        </div>
      </div>
    </aside>
  );
}

function Published({ event }: { event: PublicEvent }) {
  useDocumentTitle('Your event is live');
  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col items-center gap-4 px-5 py-12 text-center">
      <span className="flex size-[60px] items-center justify-center rounded-full bg-accent text-accent-ink">
        <Check size={30} strokeWidth={2.4} aria-hidden />
      </span>
      <h1 className="m-0 text-2xl">Your event is live</h1>
      <p className="m-0 max-w-[400px] text-sm text-muted">
        Share the link below. It comes with a ready-made card for WhatsApp, Instagram and X, plus
        Express Entry at the door.
      </p>
      <ShareLinks event={event} className="w-full items-center" />
      <div className="mt-1.5 flex flex-wrap justify-center gap-2.5">
        <Link to={`/e/${event.slug}`} className={buttonClass({ variant: 'outline', size: 'sm' })}>
          View event page
        </Link>
        <Link
          to={`/organizer?event=${event.id}`}
          className={buttonClass({ variant: 'outline', size: 'sm' })}
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
