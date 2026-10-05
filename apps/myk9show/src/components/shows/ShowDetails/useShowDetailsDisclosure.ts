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
 * default; the choice is remembered across shows and visits.
 *
 * `forceOpenKey` opens it once for a link that targets something inside it (a `#setup-publish`
 * attention item): a collapsed panel would otherwise hide the target. It is a one-shot, so the
 * user can still collapse the panel while that link's hash is in the URL.
 */
export function useShowDetailsDisclosure(forceOpenKey: string | null) {
  const [stored, setStored] = useState(readStored);
  const [forced, setForced] = useState(false);
  const [seenKey, setSeenKey] = useState<string | null>(null);
  if (forceOpenKey !== seenKey) {
    setSeenKey(forceOpenKey);
    if (forceOpenKey) setForced(true);
  }

  const open = stored || forced;
  const toggle = useCallback(() => {
    if (open) {
      setStored(false);
      setForced(false);
      writeStored(false);
    } else {
      setStored(true);
      writeStored(true);
    }
  }, [open]);

  const openPanel = useCallback(() => {
    setStored(true);
    writeStored(true);
  }, []);

  return { open, toggle, openPanel };
}
