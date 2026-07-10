/**
 * Per-tab empty state for the My Shows entries list, driven by
 * `EMPTY_STATE_BY_TAB` (task 4.4). Extracted from `index.tsx` (task 4.7).
 *
 * The whole-page zero-state (no entries at all) is handled upstream by
 * `FirstRunZeroState` in `index.tsx`, so by the time this renders the
 * exhibitor has entries — just none matching the active filter tab.
 *
 * @module MyEntriesPage/modules/EntriesEmptyState
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EMPTY_STATE_BY_TAB } from './emptyStates';
import type { EntryTabFilter } from './my-entries-types';

interface EntriesEmptyStateProps {
  selectedTab: EntryTabFilter;
  /** In-page tab switch for CTAs like `?tab=upcoming`, so "View Upcoming"
   * changes the active tab instead of navigating away from the page the
   * exhibitor is already on. */
  onSwitchTab: (tab: EntryTabFilter) => void;
}

const TAB_SWITCH_PREFIX = '?tab=';

export const EntriesEmptyState: React.FC<EntriesEmptyStateProps> = ({
  selectedTab,
  onSwitchTab,
}) => {
  const content = EMPTY_STATE_BY_TAB[selectedTab];
  const isTabSwitchCta = content.cta.to.startsWith(TAB_SWITCH_PREFIX);
  const targetTab = isTabSwitchCta
    ? (content.cta.to.slice(TAB_SWITCH_PREFIX.length) as EntryTabFilter)
    : null;

  return (
    <div className="myk9-entries-card text-center">
      <div className="bg-muted/50 rounded-full p-6 mb-4 inline-block">
        <Calendar className="h-12 w-12 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">{content.heading}</h3>
      <p className="text-muted-foreground mb-6 max-w-sm mx-auto text-base">{content.body}</p>
      {isTabSwitchCta ? (
        <Button
          onClick={() => targetTab && onSwitchTab(targetTab)}
          className="bg-primary text-primary-foreground hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 min-h-[44px]"
        >
          {content.cta.label}
        </Button>
      ) : (
        <Button
          asChild
          className="bg-primary text-primary-foreground hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 min-h-[44px]"
        >
          <Link to={content.cta.to}>{content.cta.label}</Link>
        </Button>
      )}
    </div>
  );
};

export default EntriesEmptyState;
