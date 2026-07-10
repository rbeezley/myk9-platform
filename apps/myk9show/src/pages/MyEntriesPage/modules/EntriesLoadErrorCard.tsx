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
}

export const EntriesLoadErrorCard: React.FC<EntriesLoadErrorCardProps> = ({
  refreshing,
  onRetry,
}) => (
  <div className="bg-background">
    <div className="container mx-auto px-6 py-6 max-w-7xl">
      <div className="myk9-entries-card text-center">
        <p className="text-muted-foreground mb-4 text-base">{ENTRIES_LOAD_ERROR}</p>
        <Button
          variant="outline"
          onClick={onRetry}
          disabled={refreshing}
          className="border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 transition-all duration-200 min-h-[44px]"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Retry
        </Button>
      </div>
    </div>
  </div>
);

export default EntriesLoadErrorCard;
