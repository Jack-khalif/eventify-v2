import { FileDown } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui';
import type { TicketView } from '@eventify/shared';
import { downloadTicketPdf } from './downloadTicketPdf';

export function PdfTicketButton({ ticket }: { ticket: TicketView }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const download = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await downloadTicketPdf(ticket);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create the PDF ticket.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <Button variant="outline" onClick={download} disabled={busy}>
        <FileDown size={17} aria-hidden />
        {busy ? 'Preparing PDF…' : 'Download PDF ticket'}
      </Button>
      {error && (
        <p role="alert" className="m-0 max-w-[360px] text-center text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
