import type { ReactNode } from 'react';
import { BackLink } from '../../components/BackLink';
import { useDocumentTitle } from '../../lib/useDocumentTitle';

/** The frame the terms and the privacy notice share: a title, the version, then numbered sections. */
export function LegalPage({
  title,
  version,
  intro,
  children,
}: {
  title: string;
  /** The date this wording took effect (YYYY-MM-DD). */
  version: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  useDocumentTitle(title);
  const effective = new Date(`${version}T00:00:00Z`).toLocaleDateString('en-KE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return (
    <article className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-5 pt-5 pb-14">
      <BackLink label="Back" />
      <header className="flex flex-col gap-2">
        <h1 className="m-0 text-[32px] leading-[1.05] tracking-[-0.02em] text-balance">{title}</h1>
        <p className="m-0 text-sm text-muted">In effect from {effective}</p>
        <p className="m-0 text-[15px] text-muted">{intro}</p>
      </header>
      {children}
    </article>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 text-[15px] [&_li]:mb-1.5 [&_p]:m-0 [&_ul]:m-0 [&_ul]:list-disc [&_ul]:pl-5">
      <h2 className="m-0 text-lg">{title}</h2>
      {children}
    </section>
  );
}
