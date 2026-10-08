import { useCallback, useState } from 'react';

const STORAGE_KEY = 'myk9.showDetailsOpen';

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false; // localStorage unavailable (privacy mode): start collapsed
  }
}

function writeStored(open: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, open ? '1' : '0');
  } catch {
    // Not remembered; the toggle still works for this visit.
  }
}

/**
 * Whether the show header's details panel (quick info, publishing cards) is open. Collapsed by
 * default; the chevron's choice is remembered across shows and visits.
 *
 * Two things open it without changing that choice:
 * - `forceOpenKey`: a link to something inside the panel (a `#setup-publish` attention item),
 *   because a collapsed panel would hide its target. Pass a key that is new for every navigation
 *   (the router's location key plus the hash) and `null` when no such link is active: the panel
 *   follows the key, so it closes again when the link is gone, and a repeat click on the same link
 *   opens it again after a collapse. Collapsing while the link is active dismisses that key.
 * - `openPanel`: the header's own "needs attention" chip. Open for this visit only.
 */
export function useShowDetailsDisclosure(forceOpenKey: string | null) {
  const [stored, setStored] = useState(readStored);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  const forced = forceOpenKey !== null && forceOpenKey !== dismissedKey;
  const open = stored || sessionOpen || forced;

  const toggle = useCallback(() => {
    if (open) {
      setStored(false);
      setSessionOpen(false);
      setDismissedKey(forceOpenKey);
      writeStored(false);
    } else {
      setStored(true);
      writeStored(true);
    }
  }, [open, forceOpenKey]);

  const openPanel = useCallback(() => setSessionOpen(true), []);

  return { open, toggle, openPanel };
}
