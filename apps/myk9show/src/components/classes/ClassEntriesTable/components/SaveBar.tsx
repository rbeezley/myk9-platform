/**
 * Save bar for inline editing mode - shows changes summary and save button
 */

import React from 'react';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChangesSummary } from '../types';

interface SaveBarProps {
  changesSummary: ChangesSummary;
  isSubmitting: boolean;
  submitError: string | null;
  onSubmit: () => void;
}

export const SaveBar: React.FC<SaveBarProps> = ({
  changesSummary,
  isSubmitting,
  submitError,
  onSubmit
}) => {
  if (changesSummary.total === 0) return null;

  return (
    <div className="bg-muted/30 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="text-sm text-muted-foreground">
            {changesSummary.valid > 0 && (
              <span className="text-green-600">
                {changesSummary.valid} valid change{changesSummary.valid !== 1 ? 's' : ''}
              </span>
            )}
            {changesSummary.valid > 0 && changesSummary.invalid > 0 && (
              <span className="mx-2">•</span>
            )}
            {changesSummary.invalid > 0 && (
              <span className="text-red-600">
                {changesSummary.invalid} invalid change{changesSummary.invalid !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            Press Enter or Tab to move between fields
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {submitError && (
            <div className="text-sm text-red-600">{submitError}</div>
          )}
          <Button
            onClick={onSubmit}
            disabled={!changesSummary.canSubmit || isSubmitting}
            className="apple-action-button apple-action-button-primary"
          >
            <Save className="h-4 w-4 mr-2" />
            {isSubmitting ? 'Saving...' : `Save ${changesSummary.valid} Change${changesSummary.valid !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </div>
    </div>
  );
};
