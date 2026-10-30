/**
 * ScoresheetActionBar -- Cancel / Save pinned to the bottom of every scoresheet
 * (MYK9-1501).
 *
 * Choosing Qualified reveals faults, and an NQ, Excused or DQ reason can grow
 * below the chips; none of that may push Save off the screen, so the bar is
 * sticky and the content scrolls behind it. It honors the home-indicator inset.
 *
 * Cancel calls the host's `onBack` (the router guard owns the discard prompt,
 * MYK9-1500); Save opens the sheet's Score Confirmation.
 */

import React from 'react';
import { Button } from '@myk9/ui';

export interface ScoresheetActionBarProps {
  onCancel: () => void;
  onSave: () => void;
  saveDisabled: boolean;
  isSubmitting: boolean;
}

export const ScoresheetActionBar: React.FC<ScoresheetActionBarProps> = ({
  onCancel,
  onSave,
  saveDisabled,
  isSubmitting,
}) => (
  <div
    className="sticky bottom-0 z-10 flex gap-3 border-t border-border bg-card/95 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-sm"
    data-testid="scoresheet-action-bar"
  >
    <Button variant="secondary" className="h-12 flex-1 rounded-xl text-base" onClick={onCancel}>
      Cancel
    </Button>
    <Button
      className="h-12 flex-1 rounded-xl text-base hover:brightness-110"
      onClick={onSave}
      disabled={saveDisabled}
      data-testid="submit-btn"
    >
      {isSubmitting ? 'Saving...' : 'Save'}
    </Button>
  </div>
);
