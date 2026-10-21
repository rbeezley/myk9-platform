import React from 'react';
import { ShowStatusPill } from '@/components/shows/ShowStatusPill';
import { SHOW_STATUS_CONTROL_ANCHOR } from '@/features/show-workbench/publishReadiness';
import { PublishAttentionChip } from './PublishAttentionChip';
import type { Show } from '@/types/show-types';

/**
 * ONE status line under the show's title (MYK9-1282): "Published ▾ · premium list not yet
 * published". The status is still the publish/unpublish menu, and the publishing nudge still
 * opens the details panel on the card that fixes it; they just read as one sentence instead of a
 * green pill beside an amber chip. The nudge belongs to the Overview, where the cards are.
 */
export const ShowStatusLine: React.FC<{
  show: Show;
  canManageShow: boolean;
  showPublishing: boolean;
  onOpenPublishing: () => void;
}> = ({ show, canManageShow, showPublishing, onOpenPublishing }) => (
  <span id={SHOW_STATUS_CONTROL_ANCHOR} className="inline-flex scroll-mt-20 items-center gap-x-1.5">
    <ShowStatusPill
      plain
      showId={show.id}
      status={show.status}
      clubId={show.clubId}
      entryOpenDate={show.entryOpenDate}
      entryCloseDate={show.entryCloseDate}
      onlineEntriesEnabled={show.onlineEntriesEnabled}
    />
    {showPublishing && (
      <PublishAttentionChip
        showId={show.id}
        canManageShow={canManageShow}
        onOpen={onOpenPublishing}
      />
    )}
  </span>
);
