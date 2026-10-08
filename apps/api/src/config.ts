export type Config = {
  production: boolean;
  port: number;
  databaseUrl: string | null;
  /** Web app origin, no trailing slash. */
  siteUrl: string;
  resendApiKey: string | null;
  emailFrom: string;
  payments: 'simulated' | 'off';
  /** Africa's Talking account for the "Find my tickets" SMS; null means there isn't one. */
  sms: { username: string; apiKey: string; senderId: string | null } | null;
  /** JWK JSON for signing ticket QRs; null means make a throwaway key (development only). */
  qrPrivateKey: string | null;
  /** Whoever signs in with one of these emails is a Super Admin (how the first admin gets in). */
  superAdminEmails: string[];
  /**
   * The host puts the API behind its own proxy (Railway, Render and Fly all do), so the visitor's
   * address is the last one in X-Forwarded-For. Off, the connection's own address is used.
   */
  trustProxy: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === 'production';
  const payments = env.PAYMENTS || (production ? 'off' : 'simulated');
  if (payments !== 'simulated' && payments !== 'off') {
    throw new Error(`PAYMENTS must be "simulated" or "off", not "${payments}"`);
  }
  if (production && !env.DATABASE_URL) throw new Error('DATABASE_URL is required in production');
  if (production && !env.QR_PRIVATE_KEY) {
    throw new Error('QR_PRIVATE_KEY is required in production (make one with `npm run keygen`)');
  }
  return {
    production,
    port: Number(env.PORT || 8787),
    databaseUrl: env.DATABASE_URL || null,
    siteUrl: (env.SITE_URL || 'http://localhost:5173').replace(/\/$/, ''),
    resendApiKey: env.RESEND_API_KEY || null,
    emailFrom: env.EMAIL_FROM || 'Eventify <onboarding@resend.dev>',
    payments,
    sms:
      env.AT_USERNAME && env.AT_API_KEY
        ? { username: env.AT_USERNAME, apiKey: env.AT_API_KEY, senderId: env.AT_SENDER_ID || null }
        : null,
    qrPrivateKey: env.QR_PRIVATE_KEY || null,
    trustProxy: env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true',
    superAdminEmails: (env.SUPER_ADMIN_EMAILS || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  };
}
