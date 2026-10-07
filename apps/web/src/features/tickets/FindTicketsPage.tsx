import { formatDate, formatPhone, normalizePhone, type TicketView } from '@eventify/shared';
import { ChevronRight } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Button, Cover, Tag, TextField } from '../../components/ui';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { DEMO_TICKET_PHONE, TEST_LOOKUP_CODE } from '../../mocks/testPhones';
import { ticketLine } from './ticketLine';
import { useSession } from '../auth/useSession';
import { useLookupResult, useMyTickets, useStartLookup, useVerifyLookup } from './useTickets';

/**
 * /tickets: "Find my tickets". Buyers need no account: they prove the phone is theirs with a
 * one-time SMS code and see every ticket bought with it. Someone signed in already proved theirs,
 * so their tickets show straight away.
 */
export function FindTicketsPage() {
  useDocumentTitle('Your tickets');
  const { result, clear } = useLookupResult();
  const [phone, setPhone] = useState<string | null>(null);
  const { user } = useSession();
  /** Signed in, but looking up tickets bought with another number. */
  const [otherNumber, setOtherNumber] = useState(false);
  const mine = useMyTickets({ enabled: !!user && !otherNumber && !result });
  const showMine = !!user && !otherNumber && !result;

  return (
    <section className="mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-6 px-5 pt-6 pb-12">
      <h1 className="m-0 text-[28px] tracking-[-0.02em]">Your tickets</h1>
      {showMine ? (
        mine.data ? (
          <TicketList
            phone={user.phone}
            tickets={mine.data}
            onChangeNumber={() => setOtherNumber(true)}
          />
        ) : mine.isError ? (
          <p role="alert" className="m-0 text-sm text-danger">
            Couldn't load your tickets.{' '}
            <button
              type="button"
              onClick={() => mine.refetch()}
              className="cursor-pointer font-bold underline underline-offset-3"
            >
              Retry
            </button>
          </p>
        ) : (
          <div aria-busy="true" aria-label="Loading your tickets" className="h-40" />
        )
      ) : result ? (
        <TicketList
          phone={result.phone}
          tickets={result.tickets}
          onChangeNumber={() => {
            clear();
            setPhone(null);
          }}
        />
      ) : phone ? (
        <CodeStep phone={phone} onChangeNumber={() => setPhone(null)} />
      ) : (
        <PhoneStep onSent={setPhone} />
      )}
    </section>
  );
}

function PhoneStep({ onSent }: { onSent: (phone: string) => void }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string>();
  const start = useStartLookup();

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const phone = normalizePhone(input);
    if (!phone) return setError('Enter a valid phone number');
    start.mutate(phone, { onSuccess: () => onSent(phone) });
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <p className="m-0 text-[15px] text-muted">
        Enter the phone number you used at checkout. We'll text you a code to show your tickets.
      </p>
      <TextField
        label="Phone number"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        placeholder="07XX XXX XXX"
        value={input}
        onChange={(ev) => {
          setInput(ev.target.value);
          setError(undefined);
        }}
        error={error}
      />
      <Button type="submit" size="lg" disabled={start.isPending}>
        {start.isPending ? 'Sending…' : 'Text me a code'}
      </Button>
      {start.error && (
        <p role="alert" className="m-0 text-sm text-danger">
          {start.error.message}
        </p>
      )}
      <LookupTestHint />
    </form>
  );
}

function CodeStep({ phone, onChangeNumber }: { phone: string; onChangeNumber: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const verify = useVerifyLookup();
  const resend = useStartLookup();

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code');
    verify.mutate({ phone, code });
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <p className="m-0 text-[15px] text-muted">
        We sent a 6-digit code to{' '}
        <strong className="whitespace-nowrap text-fg">{formatPhone(phone)}</strong>.
      </p>
      <TextField
        label="Code"
        autoComplete="one-time-code"
        inputMode="numeric"
        maxLength={6}
        value={code}
        onChange={(ev) => {
          setCode(ev.target.value.replace(/\D/g, ''));
          setError(undefined);
          verify.reset();
        }}
        error={error ?? verify.error?.message}
        className="[&_input]:font-mono [&_input]:tracking-[0.3em]"
      />
      <Button type="submit" size="lg" disabled={verify.isPending}>
        {verify.isPending ? 'Checking…' : 'Show my tickets'}
      </Button>
      <div className="flex flex-wrap gap-2.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => resend.mutate(phone)}
          disabled={resend.isPending}
        >
          {resend.isSuccess ? 'Code sent again' : 'Resend code'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="border-transparent text-muted"
          onClick={onChangeNumber}
        >
          Use a different number
        </Button>
      </div>
      <LookupTestHint />
    </form>
  );
}

function TicketList({
  phone,
  tickets,
  onChangeNumber,
}: {
  phone: string;
  tickets: TicketView[];
  onChangeNumber: () => void;
}) {
  // Fixed for the visit: whether an event has ended doesn't need to tick over live.
  const [now] = useState(() => Date.now());
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-[15px] text-muted">
        Tickets for <strong className="whitespace-nowrap text-fg">{formatPhone(phone)}</strong> ·{' '}
        <button
          type="button"
          onClick={onChangeNumber}
          className="cursor-pointer text-accent-text underline underline-offset-3 hover:text-fg"
        >
          Use a different number
        </button>
      </p>
      {tickets.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl border-2 border-hair p-5">
          <span className="font-extrabold">No tickets for this number</span>
          <span className="text-sm text-muted">
            Tickets are listed under the phone number entered at checkout. Try another number, or
            check the SMS we sent when you bought them.
          </span>
          <Link to="/" className="text-sm font-bold">
            Find events
          </Link>
        </div>
      ) : (
        <ul aria-label="Tickets" className="m-0 flex list-none flex-col gap-3 p-0">
          {tickets.map((t) => {
            const ended = Date.parse(t.event.endsAt) < now;
            return (
              <li key={t.id}>
                <Link
                  to={`/t/${t.id}`}
                  className="flex items-center gap-3.5 rounded-2xl border-2 border-rule p-3 text-fg no-underline hover:bg-surface"
                >
                  <Cover
                    tone={t.event.coverTone}
                    imageUrl={t.event.coverImageUrl}
                    className={`size-16 flex-none rounded-lg ${ended ? 'opacity-50' : ''}`}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-extrabold">{t.event.title}</span>
                    <span className="text-[13px] text-muted">
                      {formatDate(t.event.startsAt)} · {ticketLine(t)}
                    </span>
                    <span className="font-mono text-xs text-muted">{t.code}</span>
                  </span>
                  {t.checkedInAt ? (
                    <Tag tone="good">Checked in</Tag>
                  ) : ended ? (
                    <Tag tone="neutral">Ended</Tag>
                  ) : null}
                  <ChevronRight size={18} className="flex-none text-muted" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Only while the mock API is on: which number and code work. */
function LookupTestHint() {
  if (import.meta.env.VITE_API_MOCKS === 'off') return null;
  return (
    <div className="rounded-xl border-2 border-dashed border-hair p-3.5 text-xs text-muted">
      <strong className="text-fg">Test mode</strong> · no SMS is sent. The code is always{' '}
      <code className="font-mono text-fg">{TEST_LOOKUP_CODE}</code>.{' '}
      <code className="font-mono text-fg">{formatPhone(DEMO_TICKET_PHONE)}</code> already has a
      ticket; any number you bought with works too.
    </div>
  );
}
