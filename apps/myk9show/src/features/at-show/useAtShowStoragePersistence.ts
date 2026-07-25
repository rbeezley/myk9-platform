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
import type { AddToHomeNudgeReason } from './AtShowAddToHomeNudge';
import { requestPersistentStorage, type PersistentStorageStatus } from '@/lib/persistentStorage';

export interface AtShowStoragePersistenceOptions {
  /**
   * Ask this same nudge to also cover favorite push alerts (MYK9-79). iOS only
   * delivers web push to an INSTALLED PWA, so a user who favorited dogs and
   * enabled alerts needs Add-to-Home regardless of the storage grant. Pairing
   * with the existing nudge keeps ONE prompt on the at-show surface, not two.
   */
  favoriteAlertsPending?: boolean;
}

export interface AtShowStoragePersistence {
  /** Show the "Add to Home Screen for reliable offline scoring" nudge. */
  showAddToHomeNudge: boolean;
  /** Which need drives the nudge — selects the copy. */
  nudgeReason: AddToHomeNudgeReason;
  /** Platform-specific install steps to render in the nudge. */
  installInstructions: string;
  /** Dismiss the nudge for this device (7 days). */
  dismissNudge: () => void;
}

export function useAtShowStoragePersistence(
  options: AtShowStoragePersistenceOptions = {}
): AtShowStoragePersistence {
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
  // Favorite alerts need the install for a different reason (push delivery), so
  // they do NOT depend on the storage grant — only on iOS + not installed.
  const canNudge = isIOSSafari && !isInstalled && !isDismissed;
  const needsFavoriteAlerts = options.favoriteAlertsPending === true;
  const showAddToHomeNudge = canNudge && (storageNotDurable || needsFavoriteAlerts);
  // Offline scoring is the more severe consequence (a score can be lost), so it
  // wins the copy when both apply.
  const nudgeReason: AddToHomeNudgeReason = storageNotDurable
    ? 'offline-scoring'
    : 'favorite-alerts';

  return {
    showAddToHomeNudge,
    nudgeReason,
    installInstructions: getInstallInstructions(),
    dismissNudge: dismissInstallPrompt,
  };
}
