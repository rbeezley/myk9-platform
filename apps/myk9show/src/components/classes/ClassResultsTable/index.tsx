import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { type ColumnDef } from '@tanstack/react-table';
import { Save, AlertCircle, ClipboardList, Trophy, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { SimpleTimeFields } from '@/components/ui/simple-time-fields';
import { TooltipProvider } from '@/components/ui/tooltip/tooltip';
import { DataTable } from '@/components/ui/data-table';
import '@/styles/myk9-show-details.css';
import type { ClassResultsTableProps, BulkEntryData } from './types';
import type { ScentWorkEntry } from '@/types/scent-work-types';
import { useClassResults } from './useClassResults';
import { getPlacementBadgeClass, formatPlacement } from './utils';
import { DogInfoTooltip } from './DogInfoTooltip';
import { QualificationCell } from './QualificationCell';
import { StatusBadge } from './StatusBadge';

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

  const entryMap = useMemo(() => new Map(entries.map(e => [e.id, e])), [entries]);

  const showDeleteColumn = !!(userPermissions.canEditEntries && onDeleteEntry);
  const canEdit = userPermissions.canEditEntries;

  // Column definitions for DataTable
  const columns: ColumnDef<BulkEntryData, unknown>[] = useMemo(() => {
    const indexMap = new Map(bulkData.map((d, i) => [d.entryId, i]));
    const getIndex = (entryId: string) => indexMap.get(entryId) ?? -1;

    const cols: ColumnDef<BulkEntryData, unknown>[] = [
      // Armband
      {
        id: 'armband',
        accessorKey: 'armband',
        header: 'Armband',
        sortingFn: 'basic',
        cell: ({ row }) => {
          const item = row.original;
          return (
            <span className="font-medium">
              {item.armband ? (
                `#${item.armband}`
              ) : (
                <span className="text-muted-foreground">--</span>
              )}
            </span>
          );
        },
      },
      // Dog & Handler
      {
        id: 'dogHandler',
        accessorKey: 'dogName',
        header: 'Dog & Handler',
        cell: ({ row }) => {
          const item = row.original;
          const entry: ScentWorkEntry | undefined = entryMap.get(item.entryId);
          return (
            <div>
              <DogInfoTooltip dogName={item.dogName} registrations={entry?.registrations} />
              <div className="text-sm text-gray-600">{item.handlerName}</div>
            </div>
          );
        },
      },
      // Placement
      {
        id: 'placement',
        accessorKey: 'placement',
        header: 'Placement',
        cell: ({ row }) => {
          const item = row.original;
          return item.placement ? (
            <Badge variant="default" className={getPlacementBadgeClass(item.placement)}>
              <Trophy className="h-4 w-4" />
              {formatPlacement(item.placement)}
            </Badge>
          ) : (
            <span className="text-sm text-muted-foreground">--</span>
          );
        },
      },
      // Qualification
      {
        id: 'qualification',
        accessorKey: 'qualification',
        header: 'Qualification',
        cell: ({ row }) => {
          const item = row.original;
          const index = getIndex(item.entryId);
          return (
            <QualificationCell
              item={item}
              index={index}
              canEdit={canEdit}
              onUpdate={updateBulkData}
            />
          );
        },
      },
      // Time
      {
        id: 'searchTime',
        accessorKey: 'searchTime',
        header: () => <span className="text-center block">Time (MM:SS.HH)</span>,
        cell: ({ row }) => {
          const item = row.original;
          const index = getIndex(item.entryId);
          if (canEdit) {
            return (
              <div className="flex justify-center">
                <div
                  className={cn(
                    'inline-block rounded-md',
                    item.modifiedFields?.has('searchTime') && 'ring-2 ring-blue-500/30'
                  )}
                >
                  <SimpleTimeFields
                    value={item.searchTime}
                    onChange={value => updateBulkData(index, 'searchTime', value)}
                    onKeyDown={e => handleKeyDown(e, index, 'searchTime')}
                    disabled={!canEdit}
                    hideLabels={true}
                    data-index={index}
                    data-field="searchTime"
                  />
                </div>
              </div>
            );
          }
          return (
            <div className="text-center">
              <span className="text-sm font-mono">{item.searchTime || '--'}</span>
            </div>
          );
        },
      },
      // Faults
      {
        id: 'faults',
        accessorKey: 'faults',
        header: 'Faults',
        cell: ({ row }) => {
          const item = row.original;
          const index = getIndex(item.entryId);
          if (canEdit) {
            return (
              <Input
                type="number"
                value={item.faults}
                onChange={e => updateBulkData(index, 'faults', e.target.value)}
                onKeyDown={e => handleKeyDown(e, index, 'faults')}
                min="0"
                max="99"
                className={cn(
                  'w-16',
                  item.modifiedFields?.has('faults') && 'ring-2 ring-blue-500/30 border-blue-500'
                )}
                data-index={index}
                data-field="faults"
              />
            );
          }
          return <span className="text-sm">{item.faults}</span>;
        },
      },
      // Notes
      {
        id: 'notes',
        accessorKey: 'notes',
        header: 'Notes',
        cell: ({ row }) => {
          const item = row.original;
          const index = getIndex(item.entryId);
          if (canEdit) {
            return (
              <Input
                value={item.notes}
                onChange={e => updateBulkData(index, 'notes', e.target.value)}
                onKeyDown={e => handleKeyDown(e, index, 'notes')}
                placeholder="Optional notes"
                className={cn(
                  'w-40',
                  item.modifiedFields?.has('notes') && 'ring-2 ring-blue-500/30 border-blue-500'
                )}
                data-index={index}
                data-field="notes"
              />
            );
          }
          return <span className="text-sm">{item.notes || '--'}</span>;
        },
      },
      // Status
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const item = row.original;
          return <StatusBadge item={item} validationError={validationErrors.get(item.entryId)} />;
        },
      },
    ];

    // Conditional delete column
    if (showDeleteColumn) {
      cols.push({
        id: 'delete',
        header: '',
        enableSorting: false,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDeleteEntry?.(item.entryId)}
              className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
              title="Delete entry"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          );
        },
      });
    }

    return cols;
  }, [
    bulkData,
    canEdit,
    entryMap,
    handleKeyDown,
    onDeleteEntry,
    showDeleteColumn,
    updateBulkData,
    validationErrors,
  ]);

  return (
    <TooltipProvider>
      <div className={cn('space-y-6', className)}>
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

        <div className="myk9-show-info-card">
          <div className="myk9-show-info-header">
            <div className="flex items-center gap-2">
              <div className="myk9-show-info-title">Entries & Results</div>
              <Badge variant="secondary" className="text-xs">
                {entries.length}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {onOpenRequirements && (
                <Button variant="outline" size="sm" onClick={onOpenRequirements}>
                  <ClipboardList className="h-4 w-4" />
                  <span>Requirements</span>
                </Button>
              )}

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

        <DataTable<BulkEntryData>
          columns={columns}
          data={bulkData}
          getRowId={row => row.entryId}
          pageSize={9999}
          getRowClassName={row =>
            row.hasChanges && !row.isValid ? 'bg-red-50 dark:bg-red-950/20' : ''
          }
        />

        {userPermissions.canEditEntries && (
          <div className="flex items-center justify-between border-t border-border/50 px-4 py-3">
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
