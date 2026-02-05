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
    <div className="apple-show-info-card">
      <div className="apple-show-info-header">
        <div>
          <div className="apple-show-info-title">Class Entries</div>
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
              className="apple-action-button"
            >
              <Download className="h-4 w-4" />
              <span>Export CSV</span>
            </Button>
          )}

          {canAddEntries && (
            <Button
              onClick={onAddEntry}
              className="apple-action-button apple-action-button-primary"
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
