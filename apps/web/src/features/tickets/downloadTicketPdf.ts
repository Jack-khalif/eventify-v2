import { formatDate, formatTimeRange, type TicketView } from '@eventify/shared';
import QRCode from 'qrcode';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const INK = { r: 14 / 255, g: 26 / 255, b: 28 / 255 };
const MUTED = { r: 86 / 255, g: 102 / 255, b: 106 / 255 };

function wrapText(
  text: string,
  width: number,
  font: { widthOfTextAtSize: (text: string, size: number) => number },
  size: number,
) {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(candidate, size) > width) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const printable = (text: string) =>
  text
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\u0000-\u00ff]/g, '');

async function posterJpeg(url: string): Promise<Uint8Array> {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = url;
  try {
    await image.decode();
    const scale = Math.min(1, 1400 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const response = await fetch(canvas.toDataURL('image/jpeg', 0.9));
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    throw new Error('The event poster could not be loaded. Refresh the ticket page and try again.');
  }
}

export async function createTicketPdf(ticket: TicketView): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(INK.r, INK.g, INK.b);
  const muted = rgb(MUTED.r, MUTED.g, MUTED.b);

  page.drawText('EVENTIFY', {
    x: MARGIN,
    y: PAGE_HEIGHT - 48,
    size: 12,
    font: bold,
    color: ink,
  });
  page.drawText('EVENT TICKET', {
    x: MARGIN,
    y: PAGE_HEIGHT - 74,
    size: 10,
    font: bold,
    color: muted,
  });

  const poster = ticket.event.coverImageUrl;
  const posterTop = PAGE_HEIGHT - 98;
  const posterHeight = 228;
  const posterWidth = PAGE_WIDTH - MARGIN * 2;
  page.drawRectangle({
    x: MARGIN,
    y: posterTop - posterHeight,
    width: posterWidth,
    height: posterHeight,
    color: rgb(0.94, 0.96, 0.96),
  });
  if (poster) {
    const imageBytes = await posterJpeg(poster);
    const image = await pdf.embedJpg(imageBytes);
    const scale = Math.min(posterWidth / image.width, posterHeight / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    page.drawImage(image, {
      x: MARGIN + (posterWidth - width) / 2,
      y: posterTop - posterHeight + (posterHeight - height) / 2,
      width,
      height,
    });
  }

  let y = posterTop - posterHeight - 32;
  const titleLines = wrapText(printable(ticket.event.title), posterWidth, bold, 21).slice(0, 2);
  for (const line of titleLines) {
    page.drawText(line, { x: MARGIN, y, size: 21, font: bold, color: ink });
    y -= 26;
  }
  y -= 5;
  for (const line of [
    printable(
      `${formatDate(ticket.event.startsAt)} · ${formatTimeRange(ticket.event.startsAt, ticket.event.endsAt)}`,
    ),
    printable(ticket.event.venue),
    printable(ticket.event.address),
  ].filter(Boolean)) {
    page.drawText(line, { x: MARGIN, y, size: 11, font: regular, color: muted });
    y -= 18;
  }

  const summary = printable(ticket.event.description.join(' ').trim());
  if (summary) {
    y -= 3;
    for (const line of wrapText(summary, posterWidth, regular, 10).slice(0, 3)) {
      page.drawText(line, { x: MARGIN, y, size: 10, font: regular, color: muted });
      y -= 14;
    }
  }

  const infoY = 192;
  page.drawLine({
    start: { x: MARGIN, y: infoY + 18 },
    end: { x: PAGE_WIDTH - MARGIN, y: infoY + 18 },
    thickness: 1,
    color: rgb(0.84, 0.88, 0.88),
  });
  page.drawText('TICKET HOLDER', {
    x: MARGIN,
    y: infoY,
    size: 8,
    font: bold,
    color: muted,
  });
  page.drawText(printable(ticket.holderName), {
    x: MARGIN,
    y: infoY - 19,
    size: 13,
    font: bold,
    color: ink,
  });
  page.drawText('TICKET TYPE', {
    x: MARGIN,
    y: infoY - 47,
    size: 8,
    font: bold,
    color: muted,
  });
  const ticketType =
    ticket.count > 1 ? `${ticket.tierName} · ${ticket.index} of ${ticket.count}` : ticket.tierName;
  page.drawText(printable(ticketType), {
    x: MARGIN,
    y: infoY - 66,
    size: 12,
    font: bold,
    color: ink,
  });
  page.drawText('TICKET CODE', {
    x: MARGIN,
    y: infoY - 94,
    size: 8,
    font: bold,
    color: muted,
  });
  page.drawText(printable(ticket.code), {
    x: MARGIN,
    y: infoY - 115,
    size: 12,
    font: bold,
    color: ink,
  });

  const qrCode = QRCode.create(ticket.qrPayload, {
    errorCorrectionLevel: 'H',
  });
  const qrSize = 136;
  const qrX = PAGE_WIDTH - MARGIN - qrSize;
  const qrY = 62;
  page.drawRectangle({
    x: qrX - 7,
    y: qrY - 7,
    width: qrSize + 14,
    height: qrSize + 14,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.84, 0.88, 0.88),
    borderWidth: 1,
  });
  const quietZone = 4;
  const cellSize = qrSize / (qrCode.modules.size + quietZone * 2);
  for (let y = 0; y < qrCode.modules.size; y++) {
    for (let x = 0; x < qrCode.modules.size; x++) {
      if (!qrCode.modules.get(x, y)) continue;
      page.drawRectangle({
        x: qrX + (x + quietZone) * cellSize,
        y: qrY + (qrCode.modules.size - y - 1 + quietZone) * cellSize,
        width: cellSize,
        height: cellSize,
        color: ink,
      });
    }
  }
  page.drawText('Show this QR at the door', {
    x: qrX - 4,
    y: qrY - 23,
    size: 8,
    font: regular,
    color: muted,
  });

  page.drawText('Keep this ticket private. The QR code is valid for one entry.', {
    x: MARGIN,
    y: 55,
    size: 8,
    font: regular,
    color: muted,
  });

  return pdf.save();
}

export async function downloadTicketPdf(ticket: TicketView): Promise<void> {
  const bytes = await createTicketPdf(ticket);
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  const blob = new Blob([buffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Eventify-${ticket.code}.pdf`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
