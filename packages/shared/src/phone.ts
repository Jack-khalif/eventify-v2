/**
 * Phone numbers are stored in E.164 (+254712345678).
 * Accepts the ways people actually type them: 0712 345 678, 712345678, 254712345678, +254 712 345 678.
 */

const COUNTRY_RULES = {
  KE: { code: '254', national: /^(7|1)\d{8}$/ },
  SS: { code: '211', national: /^9\d{8}$/ },
} as const;

export type PhoneCountry = keyof typeof COUNTRY_RULES;

export function normalizePhone(input: string, defaultCountry: PhoneCountry = 'KE'): string | null {
  const digits = input.replace(/[^\d+]/g, '').replace(/^\+/, '');

  for (const rule of Object.values(COUNTRY_RULES)) {
    if (digits.startsWith(rule.code)) {
      const national = digits.slice(rule.code.length);
      return rule.national.test(national) ? `+${rule.code}${national}` : null;
    }
  }

  const rule = COUNTRY_RULES[defaultCountry];
  const national = digits.replace(/^0/, '');
  return rule.national.test(national) ? `+${rule.code}${national}` : null;
}

/** M-Pesa only reaches Kenyan mobile numbers (+2547… or +2541…). */
export const isKenyanMobile = (e164: string) => /^\+254(7|1)\d{8}$/.test(e164);

/** "+254712345678" → "+254 712 345 678", for showing a number back to the buyer. */
export function formatPhone(e164: string): string {
  const m = /^\+(254|211)(\d{3})(\d{3})(\d{3})$/.exec(e164);
  return m ? `+${m[1]} ${m[2]} ${m[3]} ${m[4]}` : e164;
}
