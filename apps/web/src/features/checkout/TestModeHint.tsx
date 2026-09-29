import { TEST_PHONE_OUTCOMES } from '../../mocks/testPhones';

const LABELS: Record<string, string> = {
  insufficient_funds: 'not enough balance',
  cancelled_by_user: 'buyer cancels',
  wrong_pin: 'wrong PIN',
  timeout: 'prompt times out',
};

/** Only while the mock API is on: how to try each M-Pesa outcome. Hidden once the real backend is used. */
export function TestModeHint() {
  if (import.meta.env.VITE_API_MOCKS === 'off') return null;
  return (
    <div className="rounded-xl border-2 border-dashed border-hair p-3.5 text-xs text-muted">
      <strong className="text-fg">Test mode</strong> · payments are simulated. Phone numbers ending
      in{' '}
      {Object.entries(TEST_PHONE_OUTCOMES).map(([digits, outcome], i) => (
        <span key={digits}>
          {i > 0 && ', '}
          <code className="font-mono text-fg">{digits}</code> = {LABELS[outcome]}
        </span>
      ))}
      . Any other Kenyan number pays successfully.
    </div>
  );
}
