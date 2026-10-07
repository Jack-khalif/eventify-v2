import type { OrganizerStatus } from './enums';
import type { AdminRole, RateChangeRequest } from './schemas';
import {
  DEFAULT_RATE_BPS,
  formatRate,
  MAX_RATE_BPS,
  MIN_RATE_BPS,
  rateNeedsApproval,
} from './money';

/**
 * Rate change rules, shared by the admin portal's dialog and the API. Agents can set any rate
 * from the 3% floor up; below it their request waits for a Super Admin. Rates only apply to
 * ticket sales made after the change.
 */

export type RateDecision =
  { outcome: 'applied' | 'sent_for_approval' } | { status: 422; error: string; message: string };

export const isRateError = (d: RateDecision): d is Extract<RateDecision, { status: 422 }> =>
  'status' in d;

export const MIN_REASON_LENGTH = 5;

export function decideRateChange(
  role: AdminRole,
  req: RateChangeRequest,
  currentBps: number,
): RateDecision {
  if (!Number.isInteger(req.rateBps) || req.rateBps < MIN_RATE_BPS || req.rateBps > MAX_RATE_BPS) {
    return {
      status: 422,
      error: 'rate_out_of_range',
      message: `Rates must be between ${formatRate(MIN_RATE_BPS)} and ${formatRate(MAX_RATE_BPS)}.`,
    };
  }
  if (req.reason.trim().length < MIN_REASON_LENGTH) {
    return { status: 422, error: 'reason_required', message: 'Give a reason for the change.' };
  }
  if (req.rateBps === currentBps) {
    return {
      status: 422,
      error: 'unchanged',
      message: `The rate is already ${formatRate(currentBps)}.`,
    };
  }
  return {
    outcome: role === 'agent' && rateNeedsApproval(req.rateBps) ? 'sent_for_approval' : 'applied',
  };
}

export const isStandardRate = (bps: number) => bps === DEFAULT_RATE_BPS;

/**
 * Organizer status moves a Super Admin can make: approve or decline an application, suspend an
 * active organizer, and bring a suspended or declined one back.
 */
const STATUS_MOVES: Record<OrganizerStatus, readonly OrganizerStatus[]> = {
  pending: ['active', 'rejected'],
  active: ['suspended'],
  suspended: ['active'],
  rejected: ['active'],
};

export const canMoveOrganizerStatus = (from: OrganizerStatus, to: OrganizerStatus) =>
  STATUS_MOVES[from].includes(to);
