import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/services/database/supabaseClient';
import { useAuthContext } from '@/hooks/useAuthContext';
import { logger } from '@/services/LoggingService';
import {
  buildPwaAnalyticsRow,
  detectBrowser,
  detectPlatform,
  markSnapshotRecorded,
  shouldRecordSnapshot,
  type PwaAnalyticsRow,
  type PwaEnvironment,
  type PwaTelemetryEvent,
} from './pwaInstallTelemetry';

/** Reads the live browser environment. Kept out of the pure module. */
export function readPwaEnvironment(): PwaEnvironment {
  const userAgent = navigator.userAgent;
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
    document.referrer.includes('android-app://');

  const pushPermission =
    typeof Notification === 'undefined'
      ? ('unsupported' as const)
      : (Notification.permission as 'granted' | 'denied' | 'default');

  return {
    platform: detectPlatform(userAgent),
    browser: detectBrowser(userAgent),
    standalone,
    pushPermission,
  };
}

/** Fire-and-forget insert, mirroring useTrackSectionView's contract. */
function insertPwaEvent(event: PwaTelemetryEvent, page: string) {
  const row = buildPwaAnalyticsRow(event, readPwaEnvironment(), page);
  (
    supabase.from as unknown as (table: string) => {
      insert: (values: PwaAnalyticsRow) => Promise<{ error: { message: string } | null }>;
    }
  )('analytics_events')
    .insert(row)
    .then(({ error }) => {
      if (error) {
        logger.debug('PWA telemetry insert failed', 'analytics', { event, error: error.message });
      }
    })
    .catch(() => {
      // Non-critical telemetry — never surface to the user.
    });
}

export interface UsePwaInstallTelemetryReturn {
  /** Record a banner outcome (accepted / dismissed / instructions shown). */
  recordEvent: (event: PwaTelemetryEvent) => void;
}

/**
 * Records one install-state snapshot per account per day, plus any banner
 * outcomes the caller reports. No-ops when signed out — analytics_events
 * requires auth.uid() and the metric is per-account by definition.
 */
export function usePwaInstallTelemetry(): UsePwaInstallTelemetryReturn {
  const { user } = useAuthContext();
  const snapshotSentRef = useRef(false);

  const recordEvent = useCallback(
    (event: PwaTelemetryEvent) => {
      if (!user) return;
      insertPwaEvent(event, window.location.pathname);
    },
    [user]
  );

  useEffect(() => {
    if (!user || snapshotSentRef.current) return;

    const storage = (() => {
      try {
        return window.localStorage;
      } catch {
        return null;
      }
    })();

    const now = new Date();
    if (!shouldRecordSnapshot(storage, now)) return;

    snapshotSentRef.current = true;
    markSnapshotRecorded(storage, now);
    insertPwaEvent('pwa_install_state', window.location.pathname);
  }, [user]);

  return { recordEvent };
}
