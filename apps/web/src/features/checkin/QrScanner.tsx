import { Camera, ScanLine } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui';

/** Chrome and Android have a built-in QR reader; Safari doesn't, so jsQR (loaded on demand) fills in. */
type BarcodeDetectorLike = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };
declare global {
  interface Window {
    BarcodeDetector?: new (options: { formats: string[] }) => BarcodeDetectorLike;
  }
}

const SCAN_EVERY_MS = 200;
/** The same QR held in front of the camera is reported once, not five times a second. */
const REPEAT_AFTER_MS = 3_000;
const MAX_FRAME_SIDE = 640;

type CameraState = 'off' | 'starting' | 'on' | 'denied' | 'failed';

async function makeReader(): Promise<(video: HTMLVideoElement) => Promise<string | null>> {
  if (window.BarcodeDetector) {
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
  }
  const { default: jsQR } = await import('jsqr');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    if (!ctx || !video.videoWidth) return null;
    const scale = Math.min(1, MAX_FRAME_SIDE / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return (
      jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' })?.data ?? null
    );
  };
}

/** Rear camera that reports each QR it reads. `paused` holds off while a result is on screen. */
export function QrScanner({ onScan, paused }: { onScan: (text: string) => void; paused: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>('off');
  const latest = useRef({ onScan, paused });
  useEffect(() => {
    latest.current = { onScan, paused };
  });

  const stop = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setState('off');
  };

  useEffect(() => {
    if (state !== 'on') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let last = { text: '', at: 0 };
    void makeReader().then((read) => {
      const tick = async () => {
        if (cancelled) return;
        if (!latest.current.paused && video.current) {
          const text = await read(video.current).catch(() => null);
          const now = Date.now();
          if (text && (text !== last.text || now - last.at > REPEAT_AFTER_MS)) {
            last = { text, at: now };
            latest.current.onScan(text);
          }
        }
        timer = setTimeout(tick, SCAN_EVERY_MS);
      };
      void tick();
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [state]);

  // Release the camera when leaving the page.
  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), []);

  const start = async () => {
    setState('starting');
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      if (video.current) {
        video.current.srcObject = stream.current;
        await video.current.play();
      }
      setState('on');
    } catch (error) {
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
      setState(
        error instanceof DOMException && error.name === 'NotAllowedError' ? 'denied' : 'failed',
      );
    }
  };

  const live = state === 'on' || state === 'starting';

  return (
    <div className="flex flex-col items-center gap-3.5 rounded-[20px] border-2 border-dashed border-hair p-5">
      <div className="relative flex aspect-square w-full max-w-[280px] items-center justify-center overflow-hidden rounded-2xl bg-surface text-muted">
        <video
          ref={video}
          muted
          playsInline
          aria-label="Camera view"
          className={live ? 'absolute inset-0 size-full object-cover' : 'hidden'}
        />
        {live ? (
          <span
            aria-hidden
            className="absolute inset-[18%] rounded-xl border-4 border-white/85 shadow-[0_0_0_999px_rgba(0,0,0,0.25)]"
          />
        ) : (
          <ScanLine size={48} strokeWidth={1.6} aria-hidden />
        )}
      </div>
      {state === 'denied' ? (
        <p role="alert" className="m-0 text-center text-[13px] font-semibold text-danger">
          Camera access is blocked. Allow it in your browser settings, or type the live code below.
        </p>
      ) : state === 'failed' ? (
        <p role="alert" className="m-0 text-center text-[13px] font-semibold text-danger">
          Couldn't start the camera. Type the live code or search for the guest below.
        </p>
      ) : (
        <span className="text-center text-[13px] text-muted">
          {live ? "Point at the guest's backup QR" : "Scan the backup QR on a guest's ticket"}
        </span>
      )}
      {live ? (
        <Button variant="outline" size="sm" onClick={stop}>
          Stop camera
        </Button>
      ) : (
        <Button size="sm" onClick={start}>
          <Camera size={16} aria-hidden />
          {state === 'denied' || state === 'failed' ? 'Try the camera again' : 'Start camera'}
        </Button>
      )}
    </div>
  );
}
