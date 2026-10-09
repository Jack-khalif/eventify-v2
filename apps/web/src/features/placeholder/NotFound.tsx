import { Link } from 'react-router';
import { buttonClass } from '../../components/ui';

export function NotFound() {
  return (
    <section className="mx-auto flex w-full max-w-[1240px] flex-col items-start gap-4 px-5 py-12">
      <h1 className="m-0 text-4xl md:text-6xl">Page not found</h1>
      <p className="m-0 text-muted">The link may be broken, or the event may have ended.</p>
      <Link to="/discover" className={buttonClass({ variant: 'primary', size: 'md' })}>
        Find events
      </Link>
    </section>
  );
}
