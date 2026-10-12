/**
 * Vercel's settings for the web app (https://vercel.com/docs/project-configuration/vercel-ts).
 *
 * /api/* is forwarded to the API, so the web app and the API share one address and sign-in works.
 * Which API is decided per Vercel environment by API_ORIGIN: set it for Preview to the staging API
 * and leave it unset for Production, so pull-request sites never touch live data.
 */
import type { VercelConfig } from '@vercel/config/v1';

const apiOrigin = (process.env.API_ORIGIN || 'https://eventify-v2.onrender.com').replace(/\/$/, '');

export const config: VercelConfig = {
  rewrites: [
    { source: '/api/:path*', destination: `${apiOrigin}/api/:path*` },
    { source: '/(.*)', destination: '/index.html' },
  ],
};
