import { publicEvents } from '@eventify/shared/fixtures';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { TicketView } from '@eventify/shared';
import { createTicketPdf } from './downloadTicketPdf';

describe('ticket PDF', () => {
  it('creates a printable one-page PDF with the static ticket QR', async () => {
    const event = { ...publicEvents()[0]!, coverImageUrl: null };
    const ticket: TicketView = {
      id: 'ticket_pdf_test',
      code: 'EVT-SAUTI-4821',
      holderName: 'Amina Otieno',
      tierName: 'Regular',
      index: 1,
      count: 1,
      event,
      qrPayload: 'EVT1.ticket_pdf_test.signature',
      checkedInAt: null,
    };

    const bytes = await createTicketPdf(ticket);
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-');
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});
