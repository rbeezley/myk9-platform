/**
 * ClassResultsTable - Main composition component
 *
 * Enhanced version of BulkResultEntry with:
 * - Role-based access control
 * - Automatic placement calculation
 * - Placement column display
 */

import React, { useMemo } from 'react';
import { Save, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// UI Components
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TooltipProvider } from '@/components/ui/tooltip/tooltip';

// Apple-inspired styling
import '@/styles/apple-show-details.css';

// Local modules
import type { ClassResultsTableProps } from './types';
import { useClassResults } from './useClassResults';
import { ResultsTableRow } from './ResultsTableRow';

export const ClassResultsTable: React.FC<ClassResultsTableProps> = ({
  entries,
  classConfig,
  userPermissions,
  onResultsSubmit,
  onDeleteEntry,
  onAddEntry,
  className,
}) => {
  const {
    bulkData,
    isSubmitting,
    submitError,
    validationErrors,
    summary,
    updateBulkData,
    handleKeyDown,
    handleSubmit,
  } = useClassResults({ entries, classConfig, userPermissions, onResultsSubmit });

  // Build an entry lookup map so row rendering is O(1) per row
  const entryMap = useMemo(() => {
    const map = new Map(entries.map((e) => [e.id, e]));
    return map;
  }, [entries]);

  const showDeleteColumn = !!(
    userPermissions.canEditEntries && onDeleteEntry
  );

  return (
    <TooltipProvider>
      <div className={cn('space-y-6', className)}>
        {/* Header with actions */}
        <div className="apple-show-info-card">
          <div className="apple-show-info-header">
            <div>
              <div className="apple-show-info-title">
                Class Entries and Results
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {userPermissions.canEditEntries
                  ? 'Enter results and view calculated placements \u2022 Press Ctrl+S (or Cmd+S) to save'
                  : 'View results and placements (read-only)'}
              </p>
            </div>
            {/* Add Entry Button - only for secretaries and admins */}
            {onAddEntry && userPermissions.canEditEntries && (
              <Button
                onClick={onAddEntry}
                className="apple-action-button apple-action-button-primary"
                size="sm"
              >
                + Add Entry
              </Button>
            )}
          </div>
        </div>

        {/* Error Messages */}
        {submitError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}

        {!userPermissions.canEditEntries && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              You have read-only access. Contact a secretary or administrator to
              edit results.
            </AlertDescription>
          </Alert>
        )}

        {/* Data Entry Table */}
        <div className="apple-show-info-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Armband</TableHead>
                <TableHead>Dog &amp; Handler</TableHead>
                <TableHead>Placement</TableHead>
                <TableHead>Qualification</TableHead>
                <TableHead className="text-center">
                  Time (MM:SS.HH)
                </TableHead>
                <TableHead>Faults</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Status</TableHead>
                {showDeleteColumn && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {bulkData.map((item, index) => {
                const entry = entryMap.get(item.entryId);
                if (!entry) return null;

                return (
                  <ResultsTableRow
                    key={item.entryId}
                    item={item}
                    index={index}
                    entry={entry}
                    canEdit={userPermissions.canEditEntries}
                    showDeleteColumn={showDeleteColumn}
                    validationError={validationErrors.get(item.entryId)}
                    onUpdate={updateBulkData}
                    onKeyDown={handleKeyDown}
                    onDelete={onDeleteEntry}
                  />
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Submit Actions */}
        {userPermissions.canEditEntries && (
          <div className="apple-show-info-card">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Press Enter or Tab to move between fields quickly &bull;
                Placements calculated automatically
              </div>

              <Button
                onClick={handleSubmit}
                disabled={!summary.canSubmit || isSubmitting}
                className="apple-action-button apple-action-button-primary"
              >
                <Save className="h-4 w-4" />
                <span>
                  {isSubmitting
                    ? 'Submitting...'
                    : `Submit ${summary.entriesWithData} Results`}
                </span>
              </Button>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};

// React.memo optimization for ClassResultsTable performance
export const MemoizedClassResultsTable = React.memo(
  ClassResultsTable,
  (prevProps, nextProps) => {
    // Compare critical props that affect rendering
    if (prevProps.entries.length !== nextProps.entries.length) return false;
    if (prevProps.classConfig?.element !== nextProps.classConfig?.element)
      return false;
    if (prevProps.classConfig?.level !== nextProps.classConfig?.level)
      return false;
    if (prevProps.userPermissions?.role !== nextProps.userPermissions?.role)
      return false;

    // Compare entries array for result changes
    for (let i = 0; i < prevProps.entries.length; i++) {
      const prevEntry = prevProps.entries[i];
      const nextEntry = nextProps.entries[i];

      // Check key fields that affect result calculations
      if (
        prevEntry.id !== nextEntry.id ||
        prevEntry.status !== nextEntry.status ||
        prevEntry.displayInfo?.armband !== nextEntry.displayInfo?.armband ||
        prevEntry.displayInfo?.dogName !== nextEntry.displayInfo?.dogName ||
        prevEntry.displayInfo?.handlerName !==
          nextEntry.displayInfo?.handlerName ||
        prevEntry.judgingState?.currentResult !==
          nextEntry.judgingState?.currentResult
      ) {
        return false;
      }
    }

    return true;
  }
);
