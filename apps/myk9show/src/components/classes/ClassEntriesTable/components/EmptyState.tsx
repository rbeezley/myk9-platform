/**
 * Empty state display when no entries exist
 */

import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  onAddEntry: () => void;
  canAddEntries: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onAddEntry, canAddEntries }) => {
  return (
    <div className="text-center py-12 bg-muted/30 rounded-lg border border-dashed border-muted-foreground/20">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <Plus className="h-8 w-8 text-muted-foreground" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground mb-2">No entries yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Add the first entry to get started with this class.
          </p>
          {canAddEntries && (
            <Button onClick={onAddEntry} className="myk9-action-button myk9-action-button-primary">
              <Plus className="h-4 w-4 mr-2" />
              Add First Entry
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
