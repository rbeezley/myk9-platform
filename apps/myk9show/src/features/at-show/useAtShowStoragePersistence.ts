/**
 * Requests persistent storage when a judge enters the scoring surface, and
 * decides whether to nudge iOS Safari users to Add to Home Screen.
 *
 * On iOS Safari a NON-installed web app has its IndexedDB (and the localStorage
 * backup) purged after 7 days of non-use — the one place a queued score would
 * silently vanish. Installing to the home screen exempts the app from that
 * purge, so when persistence is not granted we surface the install hint on the
 * surface where unsynced scores are actually created.
 */

import { useEffect, useState } from 'react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import {
  requestPersistentStorage,
  type PersistentStorageStatus,
} from '@/lib/persistentStorage';

export interface AtShowStoragePersistence {
  /** Show the "Add to Home Screen for reliable offline scoring" nudge. */
  showAddToHomeNudge: boolean;
  /** Platform-specific install steps to render in the nudge. */
  installInstructions: string;
  /** Dismiss the nudge for this device (7 days). */
  dismissNudge: () => void;
}

export function useAtShowStoragePersistence(): AtShowStoragePersistence {
  const { isInstalled, isIOSSafari, isDismissed, dismissInstallPrompt, getInstallInstructions } =
    usePWAInstall();
  const [status, setStatus] = useState<PersistentStorageStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    requestPersistentStorage().then(result => {
      if (!cancelled) setStatus(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Only nudge when the durable-storage safety net is NOT in place: iOS Safari,
  // not installed, and the user hasn't dismissed it. Both 'not-persisted' (grant
  // denied) and 'unsupported' (older iOS Safari with no Storage API) mean storage
  // is evictable — the latter is the exact non-installed iOS case Add-to-Home
  // fixes, so it must nudge too.
  const storageNotDurable = status === 'not-persisted' || status === 'unsupported';
  const showAddToHomeNudge = isIOSSafari && !isInstalled && !isDismissed && storageNotDurable;

  return {
    showAddToHomeNudge,
    installInstructions: getInstallInstructions(),
    dismissNudge: dismissInstallPrompt,
  };
}
