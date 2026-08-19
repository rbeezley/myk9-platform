/**
 * Offline-first load-error state for the My Shows page (task 4.4). Replaces
 * the "Failed to load your entries. Please check your connection." copy —
 * the product principle is that offline is normal, not a user error to
 * diagnose. Extracted from `index.tsx` (task 4.7).
 *
 * @module MyEntriesPage/modules/EntriesLoadErrorCard
 */

import React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ENTRIES_LOAD_ERROR } from './myShowsCopy';

interface EntriesLoadErrorCardProps {
  refreshing: boolean;
  onRetry: () => void;
  /**
   * `page` owns the whole viewport and is used only when there is nothing to
   * show. `inline` sits above a list the exhibitor can still read: a reload
   * failure no longer hides entries that are already on screen, so the card's
   * promise ("Your saved information is still here") stays literally true.
   */
  variant?: 'page' | 'inline';
}

export const EntriesLoadErrorCard: React.FC<EntriesLoadErrorCardProps> = ({
  refreshing,
  onRetry,
  variant = 'page',
}) => {
  const card = (
    <div className="myk9-entries-card text-center" role="status">
      <p className="text-muted-foreground mb-4 text-base">{ENTRIES_LOAD_ERROR}</p>
      <Button
        variant="outline"
        onClick={onRetry}
        disabled={refreshing}
        className="text-primary transition-all duration-200 min-h-[44px]"
      >
        <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
        Retry
      </Button>
    </div>
  );

  if (variant === 'inline') return card;

  return (
    <div className="bg-background">
      <div className="container mx-auto px-6 py-6 max-w-7xl">{card}</div>
    </div>
  );
};

export default EntriesLoadErrorCard;
