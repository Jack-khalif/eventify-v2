import { randomToken } from '@eventify/shared';
import { eq } from 'drizzle-orm';
import type { Db } from './db/client';
import { images } from './db/schema';

/** Posters arrive already shrunk by the browser (1200px JPEG), so anything bigger isn't one. */
export const MAX_POSTER_BYTES = 2 * 1024 * 1024;

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

/** What the first bytes of each allowed type look like, so a mislabelled file is turned away. */
const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 8).toString('latin1') === '\x89PNG\r\n\x1a\n',
  'image/webp': (b) =>
    b.subarray(0, 4).toString('latin1') === 'RIFF' &&
    b.subarray(8, 12).toString('latin1') === 'WEBP',
};

/**
 * Keep an uploaded poster (a `data:` URL from the Create event form) and return the path it is
 * served from. Null when it isn't a JPEG, PNG or WebP of a sensible size.
 */
export async function storePoster(db: Db, dataUrl: string, now: number): Promise<string | null> {
  const match = DATA_URL.exec(dataUrl);
  if (!match) return null;
  const [, contentType, data] = match as unknown as [string, string, string];
  const bytes = Buffer.from(data, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_POSTER_BYTES) return null;
  if (!SIGNATURES[contentType]!(bytes)) return null;

  const id = randomToken();
  await db.insert(images).values({ id, contentType, data, createdAt: new Date(now) });
  return `/api/images/${id}`;
}

export async function loadImage(db: Db, id: string) {
  const [image] = await db.select().from(images).where(eq(images.id, id));
  return image && { contentType: image.contentType, bytes: Buffer.from(image.data, 'base64') };
}
