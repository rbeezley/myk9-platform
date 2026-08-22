/**
 * Empty state for the My Shows entries list, driven by `resolveEmptyState`
 * (task 4.4). Extracted from `index.tsx` (task 4.7).
 *
 * The whole-page zero-state (no entries at all) is handled upstream by
 * `FirstRunZeroState` in `index.tsx`, so by the time this renders the
 * exhibitor has entries — just none matching the active filter tab.
 *
 * @module MyEntriesPage/modules/EntriesEmptyState
 */

import React from 'react';
import { Calendar } from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';
import { resolveEmptyState } from './emptyStates';
import type { EntryStatusFilter, EntryTabFilter } from './my-entries-types';

interface EntriesEmptyStateProps {
  selectedTab: EntryTabFilter;
  /** Active status filter — its copy explains an empty list better than the
   * tab's when one is applied. */
  selectedStatus: EntryStatusFilter;
  /** In-page tab switch for CTAs like `?tab=upcoming`, so "View Upcoming"
   * changes the active tab instead of navigating away from the page the
   * exhibitor is already on. */
  onSwitchTab: (tab: EntryTabFilter) => void;
}

const TAB_SWITCH_PREFIX = '?tab=';

export const EntriesEmptyState: React.FC<EntriesEmptyStateProps> = ({
  selectedTab,
  selectedStatus,
  onSwitchTab,
}) => {
  const content = resolveEmptyState(selectedTab, selectedStatus);
  const isTabSwitchCta = content.cta.to.startsWith(TAB_SWITCH_PREFIX);
  const targetTab = isTabSwitchCta
    ? (content.cta.to.slice(TAB_SWITCH_PREFIX.length) as EntryTabFilter)
    : null;

  return (
    <EmptyState
      icon={Calendar}
      title={content.heading}
      description={content.body}
      action={
        isTabSwitchCta
          ? {
              label: content.cta.label,
              onClick: () => {
                if (targetTab) onSwitchTab(targetTab);
              },
            }
          : { label: content.cta.label, href: content.cta.to }
      }
      size="sm"
    />
  );
};

export default EntriesEmptyState;
