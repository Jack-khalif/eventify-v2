import { Link } from 'react-router';
import { buttonClass } from '../../components/ui';

type ComingSoonProps = { title: string; phase: string; note?: string };

/** Stand-in for screens that later phases build, so navigation works end to end. */
export function ComingSoon({ title, phase, note }: ComingSoonProps) {
  return (
    <section className="mx-auto flex w-full max-w-[1240px] flex-col items-start gap-4 px-5 py-12">
      <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-extrabold text-accent-text">
        {phase}
      </span>
      <h1 className="m-0 text-4xl md:text-6xl">{title}</h1>
      <p className="m-0 max-w-xl text-muted">{note ?? 'This screen is built in a later phase.'}</p>
      <Link to="/" className={buttonClass({ variant: 'outline', size: 'sm' })}>
        Back to Discover
      </Link>
    </section>
  );
}
