import React from 'react';
import { ShowStatusPill } from '@/components/shows/ShowStatusPill';
import { ShowPresenceStack } from '@/features/show-presence/ShowPresenceStack';
import { LiveUpdateIndicator } from '@/features/show-live-sync/LiveUpdateIndicator';
import { OfflineReadyBadge } from '@/features/offline-readiness/OfflineReadyBadge';
import { ShowSyncStatus } from '@/components/shows/ShowDetails/ShowSyncStatus';
import { SHOW_STATUS_CONTROL_ANCHOR } from '@/features/show-workbench/publishReadiness';
import type { Show } from '@/types/show-types';

/**
 * Offline readiness, live status, presence and the status pill: shared by the full hero (Overview)
 * and the compact header (every other tab), so the two cannot drift.
 */
export const ShowHeaderControls: React.FC<{ show: Show }> = ({ show }) => (
  <>
    {/* Offline readiness and "Save now" (MYK9-957: was on Show Day). */}
    <ShowSyncStatus />
    <OfflineReadyBadge showId={show.id} />
    <LiveUpdateIndicator />
    <ShowPresenceStack />
    <span id={SHOW_STATUS_CONTROL_ANCHOR} className="scroll-mt-20">
      <ShowStatusPill
        showId={show.id}
        status={show.status}
        clubId={show.clubId}
        entryOpenDate={show.entryOpenDate}
        entryCloseDate={show.entryCloseDate}
        onlineEntriesEnabled={show.onlineEntriesEnabled}
      />
    </span>
  </>
);
