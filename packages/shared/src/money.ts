import type { Currency } from './enums';

/**
 * All amounts are integers in minor units (cents) so nothing is ever rounded twice.
 * Fee rates are integers in basis points: 450 = 4.5%.
 */

export const CURRENCY_LABEL: Record<Currency, string> = { KES: 'KSh', SSP: 'SSP' };

export const DEFAULT_RATE_BPS = 500;
export const MIN_RATE_BPS = 100;
export const MAX_RATE_BPS = 700;
/** Agents setting a rate below this need Super Admin approval. */
export const APPROVAL_FLOOR_BPS = 300;

export const toMinor = (major: number) => Math.round(major * 100);

/** "KSh 1,200" — whole units, matching the design. */
export function formatMoney(currency: Currency, minor: number): string {
  return `${CURRENCY_LABEL[currency]} ${Math.round(minor / 100).toLocaleString('en-US')}`;
}

export const formatRate = (bps: number) => `${bps / 100}%`;

/** Eventify's cut of one sale. The buyer pays the listed price; the fee comes out of the organizer's side. */
export const feeFor = (grossMinor: number, rateBps: number) =>
  Math.round((grossMinor * rateBps) / 10_000);

export const organizerNetFor = (grossMinor: number, rateBps: number) =>
  grossMinor - feeFor(grossMinor, rateBps);

export const rateNeedsApproval = (rateBps: number) => rateBps < APPROVAL_FLOOR_BPS;
