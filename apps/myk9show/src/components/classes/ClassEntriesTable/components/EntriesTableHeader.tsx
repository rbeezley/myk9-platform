/**
 * Header section for the entries table with title and action buttons
 */

import React from 'react';
import { Plus, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EntriesTableHeaderProps {
  enableInlineEditing: boolean;
  canExportData: boolean;
  canAddEntries: boolean;
  onExportCSV: () => void;
  onAddEntry: () => void;
}

export const EntriesTableHeader: React.FC<EntriesTableHeaderProps> = ({
  enableInlineEditing,
  canExportData,
  canAddEntries,
  onExportCSV,
  onAddEntry
}) => {
  return (
    <div className="myk9-show-info-card">
      <div className="myk9-show-info-header">
        <div>
          <div className="myk9-show-info-title">Class Entries</div>
          <p className="text-sm text-muted-foreground mt-1">
            {enableInlineEditing
              ? 'Edit results directly in the table'
              : 'Manage competition entries and results'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {canExportData && (
            <Button
              variant="outline"
              onClick={onExportCSV}
              className="myk9-action-button"
            >
              <Download className="h-4 w-4" />
              <span>Export CSV</span>
            </Button>
          )}

          {canAddEntries && (
            <Button
              onClick={onAddEntry}
              className="myk9-action-button myk9-action-button-primary"
            >
              <Plus className="h-4 w-4" />
              <span>Add Entry</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
