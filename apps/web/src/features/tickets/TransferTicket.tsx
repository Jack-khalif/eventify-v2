import {
  ticketTransferRequestSchema,
  type TicketTransferRequest,
  type TicketTransferResult,
  type TicketView,
} from '@eventify/shared';
import { Send } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button, Dialog, TextField } from '../../components/ui';
import { useTransferTicket } from './useTickets';

type FieldErrors = Partial<Record<keyof TicketTransferRequest, string>>;

/**
 * "Transfer ticket" under a pass: the holder names who it's for, they get a new ticket by email
 * and this one stops working.
 */
export function TransferTicket({
  ticket,
  onTransferred,
}: {
  ticket: TicketView;
  onTransferred: (result: TicketTransferResult & { name: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" className="text-muted" onClick={() => setOpen(true)}>
        <Send size={14} aria-hidden /> Transfer ticket
      </Button>
      {open && (
        <TransferDialog
          ticket={ticket}
          onClose={() => setOpen(false)}
          onTransferred={(result) => {
            setOpen(false);
            onTransferred(result);
          }}
        />
      )}
    </>
  );
}

function TransferDialog({
  ticket,
  onClose,
  onTransferred,
}: {
  ticket: TicketView;
  onClose: () => void;
  onTransferred: (result: TicketTransferResult & { name: string }) => void;
}) {
  const transfer = useTransferTicket(ticket.id);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = ticketTransferRequestSchema.safeParse({ name, email: email.trim() });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        next[issue.path[0] as keyof TicketTransferRequest] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    transfer.mutate(parsed.data, {
      onSuccess: (result) => onTransferred({ ...result, name: parsed.data.name }),
    });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Transfer this ticket"
      actions={
        <>
          <Button variant="outline" size="sm" onClick={onClose} disabled={transfer.isPending}>
            Keep it
          </Button>
          <Button size="sm" type="submit" form="transfer-ticket" disabled={transfer.isPending}>
            {transfer.isPending ? 'Transferring…' : 'Transfer ticket'}
          </Button>
        </>
      }
    >
      <form id="transfer-ticket" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <p className="m-0 text-muted">
          They get a new ticket for {ticket.event.title} by email. This pass, its code{' '}
          <span className="font-mono">{ticket.code}</span> and its QR stop working straight away,
          and this can't be undone.
        </p>
        <TextField
          label="Their name"
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
        />
        <TextField
          label="Their email"
          type="email"
          inputMode="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        {transfer.error && (
          <p role="alert" className="m-0 font-semibold text-danger">
            {transfer.error.message}
          </p>
        )}
      </form>
    </Dialog>
  );
}

/** What the old pass's page shows once it has been passed on in this visit. */
export function TransferDone({ result }: { result: TicketTransferResult & { name: string } }) {
  return (
    <div
      role="status"
      className="flex w-full max-w-[360px] flex-col gap-2 rounded-[22px] border-2 border-rule p-5 text-center"
    >
      <span className="text-xl font-extrabold">Ticket transferred</span>
      <span className="text-sm text-muted">
        {result.emailed ? (
          <>
            We've emailed {result.name}'s new ticket to{' '}
            <strong className="text-fg">{result.email}</strong>.
          </>
        ) : (
          <>
            We couldn't email {result.name} just now. They'll find the ticket by signing in with{' '}
            <strong className="text-fg">{result.email}</strong> and opening Tickets.
          </>
        )}{' '}
        This pass no longer works.
      </span>
    </div>
  );
}
