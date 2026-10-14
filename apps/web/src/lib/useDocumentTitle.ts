import { useEffect } from 'react';

/** Matches <title> in index.html, which is what search results show for the home page. */
const SITE_TITLE = 'Eventify — Discover events and sell tickets in Kenya & South Sudan';

export function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · Eventify` : SITE_TITLE;
  }, [title]);
}
