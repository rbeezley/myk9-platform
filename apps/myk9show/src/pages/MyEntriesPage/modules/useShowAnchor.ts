/**
 * `?show=<group key>` as an anchor: scroll that show's section into view and mark it for a moment,
 * so an old link, a bookmark or a link from another page lands on the show it names.
 *
 * Runs once per distinct key. The mark clears itself; with reduced motion the scroll is instant.
 *
 * @module MyEntriesPage/modules/useShowAnchor
 */

import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useReducedMotion } from '@/features/_shared/hooks/useReducedMotion';
import { SELECTED_SHOW_PARAM } from './myShowSections';

const HIGHLIGHT_MS = 2400;

/** The DOM id of a show's section, the scroll target. */
export function showSectionId(key: string): string {
  return `my-show-${key}`;
}

/**
 * @param listedKeys Every show key currently listed. The anchor waits until its show is listed
 *   (filters, replication) and never fires for a key that is not.
 * @param pastOpen Whether the collapsed Past shows section is open: a past show's section is not
 *   in the page until it is, so the anchor retries when this flips.
 * @returns the key to highlight now, if any.
 */
export function useShowAnchor(listedKeys: readonly string[], pastOpen: boolean): string | null {
  const [searchParams] = useSearchParams();
  const requested = searchParams.get(SELECTED_SHOW_PARAM);
  const reducedMotion = useReducedMotion();
  const [highlighted, setHighlighted] = React.useState<string | null>(null);
  const handledRef = React.useRef<string | null>(null);
  const isListed = requested !== null && listedKeys.includes(requested);

  React.useEffect(() => {
    if (!requested || !isListed || handledRef.current === requested) return;
    const target = document.getElementById(showSectionId(requested));
    if (!target) return;
    handledRef.current = requested;
    target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    setHighlighted(requested);
  }, [requested, isListed, reducedMotion, pastOpen]);

  React.useEffect(() => {
    if (!highlighted) return;
    const timer = window.setTimeout(() => setHighlighted(null), HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [highlighted]);

  return highlighted;
}
