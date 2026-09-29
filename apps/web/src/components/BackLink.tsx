import { ChevronLeft } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';

/**
 * "‹ All events": goes back if the user came from inside the app (keeping their Discover filters),
 * otherwise to `fallback` (e.g. when they opened a shared link directly).
 */
export function BackLink({ label, fallback = '/' }: { label: string; fallback?: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const cameFromApp = location.key !== 'default';
  return (
    <button
      type="button"
      onClick={() => (cameFromApp ? navigate(-1) : navigate(fallback))}
      className="inline-flex cursor-pointer items-center self-start rounded-md py-1.5 pr-2.5 pl-1 text-sm font-extrabold text-fg hover:bg-surface"
    >
      <ChevronLeft size={18} strokeWidth={2.4} aria-hidden />
      {label}
    </button>
  );
}
