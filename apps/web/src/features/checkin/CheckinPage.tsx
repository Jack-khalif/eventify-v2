import {
  checkLiveCode,
  checkQr,
  formatAgo,
  formatDate,
  formatTime,
  importVerifyKey,
  LIVE_CODE_LENGTH,
  normalizeLiveCode,
  searchGuests,
  type DoorGuest,
  type DoorList,
  type DoorResult,
} from '@eventify/shared';
import { Check, CloudOff, RefreshCw, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Button, Chip, TextField } from '../../components/ui';
import { cn } from '../../lib/cn';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { cameraSupported } from './camera';
import { QrScanner } from './QrScanner';
import { useDoor } from './useDoor';

/** How long a scan result stays up before the camera looks for the next guest. */
const RESULT_HOLD_MS = 2_500;

export function CheckinPage() {
  const { code = '' } = useParams();
  const door = useDoor(code);
  useDocumentTitle(door.list ? `Check-in · ${door.list.event.title}` : 'Door check-in');

  if (door.status === 'loading') {
    return <div aria-busy="true" aria-label="Downloading guest list" className="flex-1" />;
  }
  if (door.status === 'invalid') {
    return (
      <Message title="Check-in link not recognised">
        Ask the organizer for a fresh door staff link from their dashboard.
      </Message>
    );
  }
  if (door.status === 'error' || !door.list) {
    return (
      <Message title="Couldn't download the guest list">
        Check-in needs a connection once to download the guest list. After that it works offline.
        <Button variant="outline" size="sm" onClick={() => void door.retry()} className="mt-2">
          Try again
        </Button>
      </Message>
    );
  }
  if (!door.door) return <PickDoor list={door.list} onPick={door.setDoor} />;
  return <Scanner door={door} list={door.list} />;
}

function Message({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mx-auto flex w-full max-w-[520px] flex-col items-start gap-3 px-5 py-12">
      <h1 className="m-0 text-3xl">{title}</h1>
      <div className="flex flex-col items-start gap-2 text-muted">{children}</div>
    </section>
  );
}

function EventHeading({ list }: { list: DoorList }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h1 className="m-0 text-xl leading-tight">{list.event.title}</h1>
      <span className="text-[13px] text-muted">
        {formatDate(list.event.startsAt)} · {formatTime(list.event.startsAt)} · {list.event.venue}
      </span>
    </div>
  );
}

function PickDoor({ list, onPick }: { list: DoorList; onPick: (door: string) => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const door = name.trim();
    if (!door) return setError('Enter your door or your name.');
    onPick(door.slice(0, 60));
  };
  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col gap-5 px-5 pt-5 pb-12">
      <EventHeading list={list} />
      <form noValidate onSubmit={submit} className="flex flex-col gap-3.5">
        <h2 className="m-0 text-lg">Which door are you at?</h2>
        {list.doors.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {list.doors.map((d) => (
              <Chip key={d} active={name === d} onClick={() => setName(d)}>
                {d}
              </Chip>
            ))}
          </div>
        )}
        <TextField
          label="Door or your name"
          placeholder="e.g. Main Gate, or Volunteer — Aisha K."
          value={name}
          maxLength={60}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          error={error ?? undefined}
          hint="The organizer sees how many guests each door checks in."
        />
        <Button type="submit">Start checking in</Button>
      </form>
    </div>
  );
}

type Door = ReturnType<typeof useDoor>;

function Scanner({ door, list }: { door: Door; list: DoorList }) {
  const guests = door.guests;
  const checkedIn = guests.filter((g) => g.checkedInAt).length;
  const [result, setResult] = useState<DoorResult | null>(null);
  const [holding, setHolding] = useState(false);
  const cameFromApp = useLocation().key !== 'default';
  const navigate = useNavigate();

  const verifyKey = useMemo(() => importVerifyKey(list.verifyKey), [list.verifyKey]);
  // Scans resolve asynchronously; always judge them against the latest guest list.
  const latestGuests = useRef(guests);
  useEffect(() => {
    latestGuests.current = guests;
  });

  useEffect(() => {
    if (!holding) return;
    const t = setTimeout(() => setHolding(false), RESULT_HOLD_MS);
    return () => clearTimeout(t);
  }, [holding, result]);

  const show = (r: DoorResult) => {
    if (r.kind === 'valid') door.checkIn(r.guest.ticketId);
    setResult(r);
    setHolding(true);
    navigator.vibrate?.(r.kind === 'valid' ? 80 : [60, 60, 60]);
  };

  const onQr = async (text: string) =>
    show(await checkQr(text, latestGuests.current, await verifyKey));

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col gap-4 px-5 pt-4 pb-12">
      {cameFromApp && (
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="self-start rounded-md px-1 py-1.5 text-sm font-extrabold text-fg hover:bg-surface"
        >
          ‹ Back
        </button>
      )}
      <div className="flex items-start justify-between gap-3">
        <EventHeading list={list} />
        <span
          className="flex-none text-[13px] font-extrabold text-accent-text"
          data-testid="checkin-count"
        >
          {checkedIn} / {guests.length} checked in
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 text-[13px]">
        <span>
          Door: <strong>{door.door}</strong>
        </span>
        <button
          type="button"
          onClick={() => door.setDoor(null)}
          className="cursor-pointer font-bold text-accent-text underline"
        >
          Change door
        </button>
      </div>

      <SyncBanner door={door} list={list} />

      {cameraSupported() && <QrScanner onScan={onQr} paused={holding} />}

      <LiveCodeForm onResult={show} guests={guests} />

      <div aria-live="polite" className="empty:hidden">
        {result && <ResultCard result={result} />}
      </div>

      <div className="my-1.5 h-0.5 bg-hair" />
      <GuestSearch guests={guests} onCheckIn={door.checkIn} />
    </div>
  );
}

function SyncBanner({ door, list }: { door: Door; list: DoorList }) {
  const waiting = door.pendingCount;
  if (!door.online || door.lastSyncFailed) {
    return (
      <div
        role="status"
        className="flex items-center gap-2 rounded-xl bg-surface px-3.5 py-2.5 text-[13px] font-bold"
      >
        <CloudOff size={16} aria-hidden className="flex-none" />
        <span className="flex-1">
          Offline. Check-in still works.
          {waiting > 0 &&
            ` ${waiting} check-in${waiting === 1 ? '' : 's'} will sync when you're back online.`}
        </span>
        <button
          type="button"
          onClick={() => void door.retry()}
          aria-label="Sync now"
          className="flex-none cursor-pointer rounded-md p-1 hover:bg-surface-2"
        >
          <RefreshCw size={15} aria-hidden />
        </button>
      </div>
    );
  }
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-xl bg-good-soft px-3.5 py-2.5 text-[13px] font-bold text-good"
    >
      <Check size={16} strokeWidth={2.4} aria-hidden className="flex-none" />
      Guest list downloaded. Check-in works without internet.
      <span className="sr-only">Last updated {formatTime(list.downloadedAt)}.</span>
    </div>
  );
}

function LiveCodeForm({
  guests,
  onResult,
}: {
  guests: DoorGuest[];
  onResult: (r: DoorResult) => void;
}) {
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!code.trim()) return;
    setChecking(true);
    try {
      onResult(await checkLiveCode(code, guests));
      setCode('');
    } finally {
      setChecking(false);
    }
  };
  return (
    <form onSubmit={submit} className="flex items-end gap-2">
      <TextField
        label="Live code"
        placeholder="e.g. K7M2QX"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={LIVE_CODE_LENGTH + 2}
        value={code}
        onChange={(e) => setCode(normalizeLiveCode(e.target.value))}
        className="flex-1 [&_input]:font-mono [&_input]:tracking-[0.12em]"
      />
      <Button type="submit" disabled={checking || !code.trim()} className="h-12 flex-none">
        Check
      </Button>
    </form>
  );
}

const INVALID_TEXT = {
  not_a_ticket: ['Not a ticket', "This QR code isn't an Eventify ticket."],
  other_event: ['Wrong event', 'This ticket is for a different event.'],
  wrong_code: [
    'Code not recognised',
    'Check the code on their Live Pass and try again. It changes every few seconds.',
  ],
} as const;

function ResultCard({ result }: { result: DoorResult }) {
  const ok = result.kind === 'valid';
  const [title, detail] =
    result.kind === 'valid'
      ? ['Valid', `${result.guest.name} · ${result.guest.tierName} ticket`]
      : result.kind === 'used'
        ? [
            'Already used',
            `${result.guest.name} checked in ${formatAgo(result.guest.checkedInAt!)}${
              result.guest.checkedInDoor ? ` at ${result.guest.checkedInDoor}` : ''
            }`,
          ]
        : INVALID_TEXT[result.reason];
  return (
    <div
      className={cn(
        'flex items-center gap-3.5 rounded-2xl p-[18px]',
        ok ? 'bg-good-soft text-good' : 'bg-danger-soft text-danger',
      )}
    >
      {ok ? (
        <Check size={32} strokeWidth={2.6} aria-hidden className="flex-none" />
      ) : (
        <X size={32} strokeWidth={2.6} aria-hidden className="flex-none" />
      )}
      <div className="flex flex-col gap-0.5">
        <span className="text-[17px] font-extrabold">{title}</span>
        <span className="text-[13px] opacity-90">{detail}</span>
      </div>
    </div>
  );
}

function GuestSearch({
  guests,
  onCheckIn,
}: {
  guests: DoorGuest[];
  onCheckIn: (ticketId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const results = searchGuests(guests, query);
  return (
    <section aria-labelledby="find-guest" className="flex flex-col gap-2.5">
      <h2 id="find-guest" className="m-0 text-[13px] font-bold text-muted">
        Or find a guest manually
      </h2>
      <label className="flex h-[46px] items-center gap-2.5 rounded-xl border-2 border-rule px-3.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-text">
        <Search size={17} aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, phone or ticket code"
          aria-label="Search guests"
          className="min-w-0 flex-1 border-0 bg-transparent text-sm text-fg outline-none"
        />
      </label>
      {results.length === 0 ? (
        <p className="m-0 text-sm text-muted">
          {guests.length === 0 ? 'No tickets sold yet.' : 'No guests match that search.'}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {results.map((g) => (
            <li
              key={g.ticketId}
              className="flex items-center gap-2.5 rounded-xl border-2 border-hair px-3 py-2.5"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-px">
                <span className="text-sm font-bold">{g.name}</span>
                <span className="truncate text-xs text-muted">
                  {g.phone} · {g.tierName} · {g.code}
                </span>
              </div>
              {g.checkedInAt ? (
                <span className="flex-none rounded-lg bg-surface-2 px-3 py-[7px] text-xs font-bold text-muted">
                  Checked in
                </span>
              ) : (
                <Button
                  size="sm"
                  className="flex-none px-3 py-[7px] text-xs"
                  aria-label={`Check in ${g.name}`}
                  onClick={() => onCheckIn(g.ticketId)}
                >
                  Check in
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {guests.length > results.length && results.length > 0 && (
        <span className="text-xs text-muted">
          Showing {results.length}. Search to narrow it down.
        </span>
      )}
    </section>
  );
}
