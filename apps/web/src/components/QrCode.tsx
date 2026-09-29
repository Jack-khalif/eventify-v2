import QRCode from 'qrcode';
import { useMemo } from 'react';

type QrCodeProps = { value: string; size?: number; label?: string; className?: string };

/**
 * A real, scannable QR code drawn as SVG in the design's colours. Medium error correction
 * tolerates a scratched screen or glare at the door.
 */
export function QrCode({ value, size = 140, label = 'QR code', className }: QrCodeProps) {
  const { count, path } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    let d = '';
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (qr.modules.get(x, y)) d += `M${x} ${y}h1v1h-1z`;
      }
    }
    return { count: n, path: d };
  }, [value]);

  // A 2-module quiet zone keeps scanners happy even on a tinted card.
  const quiet = 2;
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`${-quiet} ${-quiet} ${count + quiet * 2} ${count + quiet * 2}`}
      shapeRendering="crispEdges"
      className={className}
      data-qr-value={value}
    >
      <rect
        x={-quiet}
        y={-quiet}
        width={count + quiet * 2}
        height={count + quiet * 2}
        fill="#ffffff"
      />
      <path d={path} fill="#0e1a1c" />
    </svg>
  );
}
