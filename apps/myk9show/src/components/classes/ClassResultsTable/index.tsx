/**
 * ClassResultsTable - Main composition component
 *
 * Enhanced version of BulkResultEntry with:
 * - Role-based access control
 * - Automatic placement calculation
 * - Placement column display
 */

import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, AlertCircle, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';

// UI Components
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TooltipProvider } from '@/components/ui/tooltip/tooltip';

// Premium styling
import '@/styles/myk9-show-details.css';

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
  classId,
  onOpenRequirements,
}) => {
  const navigate = useNavigate();
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
  const entryMap = useMemo(() => new Map(entries.map(e => [e.id, e])), [entries]);

  const showDeleteColumn = !!(userPermissions.canEditEntries && onDeleteEntry);

  return (
    <TooltipProvider>
      <div className={cn('space-y-6', className)}>
        {/* Header with actions */}
        <div className="myk9-show-info-card">
          <div className="myk9-show-info-header">
            <div className="flex items-center gap-2">
              <div className="myk9-show-info-title">Entries & Results</div>
              <Badge variant="secondary" className="text-xs">
                {entries.length}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {/* Requirements button */}
              {onOpenRequirements && (
                <Button variant="outline" size="sm" onClick={onOpenRequirements}>
                  <ClipboardList className="h-4 w-4" />
                  <span>Requirements</span>
                </Button>
              )}
              {/* Enter Scores button */}
              {classId && userPermissions.canEditEntries && (
                <Button
                  variant="default"
                  size="sm"
                  className="myk9-action-button myk9-action-button-primary"
                  onClick={() => navigate(`/scoring/secretary/classes/${classId}`)}
                >
                  Enter Scores
                </Button>
              )}
              {/* Add Entry button */}
              {onAddEntry && userPermissions.canEditEntries && (
                <Button
                  onClick={onAddEntry}
                  className="myk9-action-button myk9-action-button-primary"
                  size="sm"
                >
                  + Add Entry
                </Button>
              )}
            </div>
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
              You have read-only access. Contact a secretary or administrator to edit results.
            </AlertDescription>
          </Alert>
        )}

        {/* Data Entry Table */}
        <div className="myk9-show-info-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Armband</TableHead>
                <TableHead>Dog &amp; Handler</TableHead>
                <TableHead>Placement</TableHead>
                <TableHead>Qualification</TableHead>
                <TableHead className="text-center">Time (MM:SS.HH)</TableHead>
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
          <div className="myk9-show-info-card">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Press Enter or Tab to move between fields quickly &bull; Placements calculated
                automatically
              </div>

              <Button
                onClick={handleSubmit}
                disabled={!summary.canSubmit || isSubmitting}
                className="myk9-action-button myk9-action-button-primary"
              >
                <Save className="h-4 w-4" />
                <span>
                  {isSubmitting ? 'Submitting...' : `Submit ${summary.entriesWithData} Results`}
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
export const MemoizedClassResultsTable = React.memo(ClassResultsTable, (prevProps, nextProps) => {
  // Compare critical props that affect rendering
  if (prevProps.entries.length !== nextProps.entries.length) return false;
  if (prevProps.classConfig?.element !== nextProps.classConfig?.element) return false;
  if (prevProps.classConfig?.level !== nextProps.classConfig?.level) return false;
  if (prevProps.userPermissions?.role !== nextProps.userPermissions?.role) return false;
  if (prevProps.classId !== nextProps.classId) return false;

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
      prevEntry.displayInfo?.handlerName !== nextEntry.displayInfo?.handlerName ||
      prevEntry.judgingState?.currentResult !== nextEntry.judgingState?.currentResult
    ) {
      return false;
    }
  }

  return true;
});
