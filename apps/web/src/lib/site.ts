/** Public site origin used in share links. Defaults to wherever the app is running. */
const SITE_URL = (import.meta.env.VITE_SITE_URL ?? '').replace(/\/$/, '');

export const siteUrl = (path: string) => (SITE_URL || window.location.origin) + path;

/** "https://eventify.co/e/x" → "eventify.co/e/x" */
export const displayUrl = (url: string) => url.replace(/^https?:\/\//, '');
