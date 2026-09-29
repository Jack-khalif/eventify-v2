/** Longest side of a stored poster. Plenty for cards and the event page cover. */
const MAX_SIDE = 1200;
export const MAX_POSTER_BYTES = 10 * 1024 * 1024;

/**
 * Shrink a chosen poster to a JPEG data URL. Until uploads go to the backend (Phase B) the poster
 * travels inside the event, so it has to stay small. Keeps the whole image: covers never crop.
 */
export async function readPoster(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}
