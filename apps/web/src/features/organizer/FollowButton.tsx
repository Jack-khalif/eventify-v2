import { cn } from '../../lib/cn';
import { useFollowing } from '../../lib/following';

type FollowButtonProps = { handle: string; name: string; className?: string };

export function FollowButton({ handle, name, className }: FollowButtonProps) {
  const { isFollowing, toggle } = useFollowing();
  const following = isFollowing(handle);
  return (
    <button
      type="button"
      aria-pressed={following}
      aria-label={following ? `Unfollow ${name}` : `Follow ${name}`}
      onClick={() => toggle(handle)}
      className={cn(
        'flex-none cursor-pointer rounded-md border-2 border-rule px-4 py-2 text-sm font-extrabold transition-colors',
        following ? 'bg-fg text-bg' : 'bg-transparent text-fg hover:bg-surface',
        className,
      )}
    >
      {following ? 'Following' : 'Follow'}
    </button>
  );
}
