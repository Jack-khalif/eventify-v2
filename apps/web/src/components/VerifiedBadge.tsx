import { BadgeCheck } from 'lucide-react';

export function VerifiedBadge({ size = 18 }: { size?: number }) {
  return (
    <BadgeCheck
      size={size}
      fill="var(--ev-accent)"
      stroke="var(--ev-accent-ink)"
      strokeWidth={2}
      aria-label="Verified"
      role="img"
      className="flex-none"
    />
  );
}
