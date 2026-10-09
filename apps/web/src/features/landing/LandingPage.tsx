import { DEFAULT_RATE_BPS, formatRate } from '@eventify/shared';
import { ArrowDown, Search, Smartphone, type LucideIcon } from 'lucide-react';
import { Link, Navigate, useLocation } from 'react-router';
import { hostCta } from '../../app/nav';
import { buttonClass } from '../../components/ui';
import { displayUrl, siteUrl } from '../../lib/site';
import { useSession } from '../auth/useSession';

const STATS: { figure: string; label: string }[] = [
  {
    figure: formatRate(DEFAULT_RATE_BPS),
    label: 'Of ticket sales, taken from the payout. Nothing up front',
  },
  { figure: '2', label: 'Countries: Kenya and South Sudan' },
  { figure: '4', label: 'Kinds of organizer, one platform' },
];

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Search,
    title: "Discover what's near you",
    body: 'Search by city — Nairobi, Juba and beyond — or filter by Corporate, Campus, Music & Arts, Workshops and Free.',
  },
  {
    icon: Smartphone,
    title: 'Checkout in under a minute',
    body: 'Pay with M-Pesa from your phone. The price shown is the price you pay.',
  },
];

const HOSTS: { kind: string; body: string }[] = [
  { kind: 'Corporate', body: 'Teams running conferences and launches.' },
  { kind: 'Campus clubs', body: 'Student clubs and societies hosting campus events, many free.' },
  { kind: 'Independent artists', body: 'Selling out shows and listening sessions.' },
  { kind: 'Workshop hosts', body: 'Building a track record one session at a time.' },
];

const WIDE_SHOTS = [
  {
    src: '/landing/shot-discover.webp',
    alt: 'Eventify home and discovery screen',
    caption: "Discover what's on, filtered by city and category",
  },
  {
    src: '/landing/shot-dashboard.webp',
    alt: 'Eventify organizer dashboard',
    caption: 'Organizer dashboard — sales, payouts and check-ins',
  },
];

const PHONE_SHOTS = [
  {
    src: '/landing/shot-event.webp',
    alt: 'Eventify event page on mobile',
    caption: 'Event page with transparent ticket tiers',
  },
  {
    src: '/landing/shot-livepass.webp',
    alt: 'Eventify Express Entry Live Pass ticket',
    caption: 'Express Entry Live Pass — queue-free check-in',
  },
];

const eyebrow = 'text-xs font-extrabold tracking-[0.1em] text-accent-text uppercase';
const band = 'border-t-2 border-rule';
const inner = 'mx-auto w-full max-w-[1240px] px-5';
const frame = 'overflow-hidden rounded-[20px] border-2 border-rule';

/** The first page visitors see: what Eventify is, for buyers and for organizers. Events live at /discover. */
export function LandingPage() {
  const cta = hostCta(useSession().user);
  const { search } = useLocation();

  // Discover used to live here, so old shared links like /?city=Juba still open the filtered list.
  const params = new URLSearchParams(search);
  if (['city', 'category', 'q'].some((key) => params.has(key))) {
    return <Navigate to={`/discover${search}`} replace />;
  }

  return (
    <>
      {/* The photo sits beside the headline at every width; on phones the rest runs full width below. */}
      <section
        className={`${inner} grid grid-cols-[1fr_38%] items-center gap-x-3 gap-y-[22px] pt-8 pb-10 sm:gap-x-8 md:pt-14 md:pb-16 lg:grid-cols-[1.1fr_1fr] lg:gap-x-12`}
      >
        <div className="flex min-w-0 flex-col gap-3 lg:gap-[22px] lg:self-end">
          <span className="self-start rounded-full bg-accent-soft px-3 py-1.5 text-xs font-bold whitespace-nowrap text-accent-text sm:text-[13px]">
            Kenya &amp; South Sudan
          </span>
          <h1 className="m-0 text-[clamp(26px,7.6vw,46px)] leading-[1.02] tracking-[-0.03em] text-balance lg:text-[clamp(46px,5vw,64px)]">
            East Africa's{' '}
            <span className="rounded-lg bg-accent px-2.5 whitespace-nowrap text-accent-ink">
              best way
            </span>{' '}
            to discover events and sell tickets
          </h1>
        </div>
        <div className="col-span-2 flex min-w-0 flex-col gap-[22px] lg:col-span-1 lg:col-start-1 lg:self-start">
          <p className="m-0 max-w-[52ch] text-[17px] leading-[1.6] text-muted">
            From sold-out concerts to campus hackathons and corporate launches — Eventify brings
            world-class ticketing to Kenya and South Sudan, built around how people actually pay:
            M-Pesa today, with MTN Mobile Money and card on the way.
          </p>
          <div className="mt-1.5 flex flex-wrap items-end gap-x-4 gap-y-3">
            <Link
              to="/discover"
              className={buttonClass({
                className: 'px-[22px] py-3.5 text-accent-ink hover:text-accent-ink',
              })}
            >
              Browse what's on
            </Link>
            {/* The one animated thing on the page: an arrow and a spreading ring point hosts here. */}
            <div className="flex flex-col items-center gap-1.5">
              <span
                aria-hidden
                className="flex items-center gap-1 text-[13px] font-extrabold text-accent-text"
              >
                Hosting? Start here
                <ArrowDown size={16} strokeWidth={3} className="motion-safe:animate-ev-point" />
              </span>
              <Link
                to={cta.to}
                className={buttonClass({
                  variant: 'outline',
                  className:
                    'border-accent-text bg-accent-soft px-[22px] py-3 text-fg hover:text-fg motion-safe:animate-ev-cta-ring',
                })}
              >
                {cta.label} — free to list
              </Link>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-[18px] gap-y-1 text-[13px] font-semibold text-muted">
            <span>No surprise fees</span>
            <span aria-hidden>·</span>
            <span>Pay with M-Pesa</span>
            <span aria-hidden>·</span>
            <span>Free events cost nothing</span>
          </div>
        </div>
        <div className="col-start-2 row-start-1 aspect-[4/5] overflow-hidden rounded-2xl border-2 border-rule bg-surface sm:rounded-3xl lg:row-end-3 lg:max-h-[620px] lg:justify-self-end">
          <img
            src="/landing/hero.webp"
            alt=""
            width={1104}
            height={736}
            className="block size-full object-cover"
          />
        </div>
      </section>

      <section aria-label="Eventify in numbers" className={`${band} py-10`}>
        <dl className={`${inner} m-0 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-6`}>
          {STATS.map(({ figure, label }) => (
            <div key={label} className="flex flex-col-reverse justify-end gap-1.5">
              <dt className="text-[13px] font-semibold text-muted">{label}</dt>
              <dd className="m-0 text-4xl leading-tight font-extrabold tracking-[-0.02em] text-accent-text">
                {figure}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="landing-features" className={`${band} py-12 md:py-16`}>
        <div className={`${inner} flex flex-col gap-8`}>
          <h2 id="landing-features" className="m-0 max-w-[20ch] text-[32px] tracking-[-0.02em]">
            Everything you need, nothing you don't
          </h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-5">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="flex flex-col gap-3 rounded-[20px] border-2 border-rule p-6"
              >
                <Icon size={26} aria-hidden className="text-accent-text" />
                <h3 className="m-0 text-[19px]">{title}</h3>
                <p className="m-0 text-[14.5px] leading-[1.6] text-muted">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="landing-hosts" className={`${band} py-12 md:py-16`}>
        <div className={`${inner} grid items-center gap-x-12 gap-y-8 lg:grid-cols-2`}>
          <div className="flex flex-col gap-3.5">
            <span className={eyebrow}>Built for every kind of host</span>
            <h2 id="landing-hosts" className="m-0 text-3xl tracking-[-0.02em]">
              One platform, four kinds of organizer
            </h2>
            <p className="m-0 max-w-[48ch] text-[15.5px] leading-[1.6] text-muted">
              Every organizer gets a public profile page, a short link like{' '}
              <span className="font-bold text-accent-text">
                {displayUrl(siteUrl('/e/your-event'))}
              </span>
              , and share buttons for WhatsApp, Instagram and X.
            </p>
          </div>
          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
            {HOSTS.map(({ kind, body }) => (
              <li
                key={kind}
                className="flex flex-col gap-1 rounded-2xl border-2 border-rule bg-surface p-4"
              >
                <span className="text-[15px] font-extrabold">{kind}</span>
                <span className="text-sm text-muted">{body}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="landing-showcase" className={`${band} py-12 md:py-16`}>
        <div className={`${inner} flex flex-col gap-8`}>
          <div className="flex flex-col gap-2.5">
            <span className={eyebrow}>See it in action</span>
            <h2 id="landing-showcase" className="m-0 text-3xl tracking-[-0.02em]">
              From discovery to the door
            </h2>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {WIDE_SHOTS.map((shot) => (
              <Shot key={shot.src} {...shot} width={1600} height={1125} />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-[repeat(2,240px)]">
            {PHONE_SHOTS.map((shot) => (
              <Shot key={shot.src} {...shot} width={780} height={1688} />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-accent text-accent-ink">
        <div className={`${inner} flex flex-wrap items-end justify-between gap-5 py-12 md:py-14`}>
          <div className="flex max-w-[520px] flex-col gap-2">
            <h2 className="m-0 text-[32px] leading-[1.1] tracking-[-0.02em] text-pretty">
              Every event is free to list.
            </h2>
            <span className="text-[15px]">
              No listing fees, no monthly cost — organizers only pay when tickets sell.
            </span>
          </div>
          <Link
            to={cta.to}
            className={buttonClass({
              variant: 'ink',
              className: 'px-5 py-3.5 text-white hover:text-white',
            })}
          >
            Start for free
          </Link>
        </div>
      </section>

      <footer className="border-t-2 border-rule">
        <div className={`${inner} flex flex-wrap items-center justify-between gap-3 py-8`}>
          <div className="flex items-center gap-2">
            <img src="/eventify-mark.png" alt="" width={26} height={14} />
            <span className="text-[13px] text-muted">
              Eventify — event ticketing and discovery for East Africa.
            </span>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-4 text-[13px] [&_a]:no-underline">
            <Link to="/discover">Discover</Link>
            <Link to="/organizer">For organizers</Link>
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms of Service</Link>
          </nav>
        </div>
        <p className={`${inner} m-0 border-t border-hair pt-5 pb-8 text-xs text-muted`}>
          © {new Date().getFullYear()} Eventify. All rights reserved.
        </p>
      </footer>
    </>
  );
}

function Shot({
  src,
  alt,
  caption,
  width,
  height,
}: {
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
}) {
  return (
    <figure className="m-0 flex flex-col gap-2.5">
      <div className={frame}>
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading="lazy"
          className="block h-auto w-full"
        />
      </div>
      <figcaption className="text-[13px] font-semibold text-muted">{caption}</figcaption>
    </figure>
  );
}
