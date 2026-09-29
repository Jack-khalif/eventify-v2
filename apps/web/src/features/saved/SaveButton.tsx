import { Heart } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useSavedEvents } from '../../lib/saved';

type SaveButtonProps = { eventId: string; title: string; className?: string };

export function SaveButton({ eventId, title, className }: SaveButtonProps) {
  const { isSaved, toggle } = useSavedEvents();
  const saved = isSaved(eventId);
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? `Remove ${title} from saved` : `Save ${title}`}
      onClick={() => toggle(eventId)}
      className={cn(
        'flex size-9 cursor-pointer items-center justify-center rounded-full bg-card-date text-fg transition-transform hover:scale-105',
        className,
      )}
    >
      <Heart
        size={18}
        strokeWidth={2.2}
        fill={saved ? 'var(--ev-danger)' : 'none'}
        className={saved ? 'text-danger' : undefined}
      />
    </button>
  );
}
