import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { type ColumnDef } from '@tanstack/react-table';
import { Save, AlertCircle, ClipboardList, Eraser, Plus, Trophy, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { TooltipProvider } from '@/components/ui/tooltip/tooltip';
import { DataTable, TimeInput, formatSearchTime } from '@/components/ui/data-table';
import { ArmbandBadge } from '@/components/common/ArmbandBadge';
import { CheckInStatusBadge } from '@/components/common/CheckInStatusBadge';
import { StatusPickerDialog } from '@/components/common/StatusPickerDialog';
import { SubTabs, type SubTabDef } from '@/components/common/SubTabs';
import '@/styles/myk9-show-details.css';
import type { ClassResultsTableProps, BulkEntryData } from './types';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';
import type { ScentWorkEntry } from '@/types/scent-work-types';
import type { CheckInStatus } from '@myk9/core';
import { useClassResults } from './useClassResults';
import { getPlacementBadgeClass, formatPlacement } from './utils';
import { DogInfoTooltip } from './DogInfoTooltip';
import { QualificationCell } from './QualificationCell';
import { StatusBadge } from './StatusBadge';
import { useViewPreference, CARD_TABLE_MODES } from '@/hooks/useViewPreference';
import { ViewToggle } from '@/components/common/ViewToggle';
import { EntryCardGrid } from './EntryCardGrid';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useEntryStore } from '@/store/entryStore';

export type ScoringStatusTab = 'all' | 'pending' | 'completed';

function isEntryScored(entryId: string, rawEntryMap: Map<string, RawEntryRow>): boolean {
  const raw = rawEntryMap.get(entryId);
  if (!raw) return false;
  if (raw.is_scored === true) return true;
  return !!raw.result_status && raw.result_status !== 'pending';
}

function getSubmitLabel(
  summary: { entriesWithData: number; clearedEntries: number },
  isSubmitting: boolean
): string {
  if (isSubmitting) return 'Submitting...';
  if (summary.clearedEntries > 0 && summary.entriesWithData === 0) {
    const n = summary.clearedEntries;
    return `Clear ${n} Result${n !== 1 ? 's' : ''}`;
  }
  if (summary.clearedEntries > 0) {
    return `Submit ${summary.entriesWithData} / Clear ${summary.clearedEntries}`;
  }
  return `Submit ${summary.entriesWithData} Results`;
}

export const ClassResultsTable: React.FC<ClassResultsTableProps> = ({
  entries,
  rawEntries,
  classConfig,
  userPermissions,
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
  } = useClassResults({
    entries,
    rawEntries: rawEntries ?? [],
    classConfig,
    userPermissions,
    classId: classId ?? '',
  });

  const { isExhibitor, isSecretary, isJudge, user } = useAuthContext();
  const updateCheckInStatus = useEntryStore(s => s.updateCheckInStatus);
  const isStaff = isSecretary || isJudge || !isExhibitor;

  const [statusPickerEntry, setStatusPickerEntry] = useState<{
    entryId: string;
    armband: string;
    dogName: string;
    handlerName: string;
    currentStatus: CheckInStatus;
  } | null>(null);

  function handleStatusChange(entryId: string, newStatus: CheckInStatus) {
    if (user?.id) {
      updateCheckInStatus(entryId, newStatus, user.id);
    }
  }

  const entryMap = useMemo(() => new Map(entries.map(e => [e.id, e])), [entries]);

  const showDeleteColumn = !!(userPermissions.canEditEntries && onDeleteEntry);
  const canEdit = userPermissions.canEditEntries;

  const [viewMode, setViewMode] = useViewPreference('class-results', 'table');
  // Guard: card view requires classId for scoring navigation
  const effectiveViewMode = classId ? viewMode : 'table';

  // Scoring status tab filtering (Pending / Completed / All)
  const [scoringTab, setScoringTab] = useState<ScoringStatusTab>('pending');

  /** Entry IDs that are scored, derived from raw DB entries. */
  const rawEntryMap = useMemo(
    () => new Map((rawEntries ?? []).map(r => [r.id, r])),
    [rawEntries]
  );

  const scoredEntryIds = useMemo(
    () => new Set(entries.filter(e => isEntryScored(e.id, rawEntryMap)).map(e => e.id)),
    [entries, rawEntryMap]
  );

  const tabCounts = useMemo(() => {
    const completed = scoredEntryIds.size;
    return { pending: entries.length - completed, completed };
  }, [entries.length, scoredEntryIds]);

  const scoringTabs: SubTabDef[] = useMemo(
    () => [
      { id: 'pending', label: 'Pending', badge: tabCounts.pending },
      { id: 'completed', label: 'Completed', badge: tabCounts.completed },
      { id: 'all', label: 'All' },
    ],
    [tabCounts.pending, tabCounts.completed]
  );

  /** Bulk data filtered by the active scoring tab. */
  const filteredBulkData = useMemo(() => {
    if (scoringTab === 'all') return bulkData;
    if (scoringTab === 'completed') return bulkData.filter(d => scoredEntryIds.has(d.entryId));
    return bulkData.filter(d => !scoredEntryIds.has(d.entryId));
  }, [bulkData, scoringTab, scoredEntryIds]);

  /** Source entries filtered by the active scoring tab (for card view). */
  const filteredEntries = useMemo(() => {
    if (scoringTab === 'all') return entries;
    if (scoringTab === 'completed') return entries.filter(e => scoredEntryIds.has(e.id));
    return entries.filter(e => !scoredEntryIds.has(e.id));
  }, [entries, scoringTab, scoredEntryIds]);

  const columns: ColumnDef<BulkEntryData, unknown>[] = useMemo(() => {
    const cols: ColumnDef<BulkEntryData, unknown>[] = [
      // Armband
      {
        id: 'armband',
        accessorKey: 'armband',
        header: 'Armband',
        sortingFn: 'basic',
        cell: ({ row }) => <ArmbandBadge armband={row.original.armband} />,
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
        cell: ({ row }) => (
          <QualificationCell item={row.original} canEdit={canEdit} onUpdate={updateBulkData} />
        ),
      },
      // Time
      {
        id: 'searchTime',
        accessorKey: 'searchTime',
        header: 'Search Time',
        cell: ({ row }) => {
          const item = row.original;
          if (canEdit) {
            return (
              <div className="flex justify-center">
                <div
                  className={cn(
                    'inline-block rounded-md',
                    item.modifiedFields?.has('searchTime') && 'ring-2 ring-blue-500/30'
                  )}
                >
                  <div className="flex items-center gap-1">
                    <TimeInput
                      value={item.searchTime}
                      onChange={digits =>
                        updateBulkData(item.entryId, 'searchTime', formatSearchTime(digits))
                      }
                      onCommit={() => {
                        const next = document.querySelector(
                          `[data-index="${row.index}"][data-field="faults"]`
                        ) as HTMLElement;
                        next?.focus();
                      }}
                      onCancel={() => {}}
                      className="w-24 h-8 text-center font-mono"
                    />
                    {item.searchTime && (
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => updateBulkData(item.entryId, 'searchTime', '')}
                        title="Clear time"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
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
          if (canEdit) {
            return (
              <Input
                type="number"
                value={item.faults}
                onChange={e => updateBulkData(item.entryId, 'faults', e.target.value)}
                onFocus={e => e.target.select()}
                onKeyDown={e => handleKeyDown(e, row.index, 'faults')}
                min="0"
                max="99"
                className={cn(
                  'w-16',
                  item.modifiedFields?.has('faults') && 'ring-2 ring-blue-500/30 border-blue-500'
                )}
                data-index={row.index}
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
          if (canEdit) {
            return (
              <Input
                value={item.notes}
                onChange={e => updateBulkData(item.entryId, 'notes', e.target.value)}
                onKeyDown={e => handleKeyDown(e, row.index, 'notes')}
                placeholder="Optional notes"
                className={cn(
                  'w-40',
                  item.modifiedFields?.has('notes') && 'ring-2 ring-blue-500/30 border-blue-500'
                )}
                data-index={row.index}
                data-field="notes"
              />
            );
          }
          return <span className="text-sm">{item.notes || '--'}</span>;
        },
      },
      // Check-in Status
      {
        id: 'checkInStatus',
        header: 'Check-in',
        cell: ({ row }) => {
          const item = row.original;
          const entry = entryMap.get(item.entryId);
          const checkInStatus: CheckInStatus = entry?.checkInStatus ?? 'no-status';
          return (
            <CheckInStatusBadge
              status={checkInStatus}
              size="sm"
              onClick={() =>
                setStatusPickerEntry({
                  entryId: item.entryId,
                  armband: item.armband ?? '',
                  dogName: item.dogName ?? 'Unknown',
                  handlerName: item.handlerName ?? '',
                  currentStatus: checkInStatus,
                })
              }
            />
          );
        },
      },
      // Scoring Status
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const item = row.original;
          return <StatusBadge item={item} validationError={validationErrors.get(item.entryId)} />;
        },
      },
    ];

    // Clear result column
    if (canEdit) {
      cols.push({
        id: 'clearResult',
        header: '',
        cell: ({ row }) => {
          const item = row.original;
          if (!item.hadExistingData && !item.hasChanges) return null;
          return (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => {
                updateBulkData(item.entryId, 'qualification', '');
                updateBulkData(item.entryId, 'searchTime', '');
                updateBulkData(item.entryId, 'faults', '0');
                updateBulkData(item.entryId, 'notes', '');
                updateBulkData(item.entryId, 'qualificationReason', '');
              }}
              title="Clear result"
            >
              <Eraser className="h-3.5 w-3.5" />
            </Button>
          );
        },
      });
    }

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
              {classId && (
                <ViewToggle
                  modes={CARD_TABLE_MODES}
                  active={effectiveViewMode}
                  onChange={setViewMode}
                />
              )}
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
                  <Plus className="h-4 w-4" />
                  Add Entry
                </Button>
              )}
            </div>
          </div>

          <SubTabs
            tabs={scoringTabs}
            value={scoringTab}
            onValueChange={v => setScoringTab(v as ScoringStatusTab)}
            className="px-4 pt-3"
          />

          {effectiveViewMode === 'cards' ? (
            <EntryCardGrid
              entries={filteredEntries}
              classId={classId!}
              onStatusClick={entry =>
                setStatusPickerEntry({
                  entryId: entry.entryId,
                  armband: entry.armband,
                  dogName: entry.dogName,
                  handlerName: entry.handlerName,
                  currentStatus: entry.status,
                })
              }
            />
          ) : (
            <>
              <DataTable<BulkEntryData>
                tableId="classResults"
                columns={columns}
                data={filteredBulkData}
                getRowId={row => row.entryId}
                pageSize={9999}
                getRowClassName={row =>
                  row.isCleared
                    ? 'bg-amber-50 dark:bg-amber-950/20'
                    : row.hasChanges && !row.isValid
                      ? 'bg-red-50 dark:bg-red-950/20'
                      : ''
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
                    <span>{getSubmitLabel(summary, isSubmitting)}</span>
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <StatusPickerDialog
        open={statusPickerEntry !== null}
        onOpenChange={open => {
          if (!open) setStatusPickerEntry(null);
        }}
        entry={statusPickerEntry ?? { entryId: '', armband: '', dogName: '', handlerName: '' }}
        currentStatus={statusPickerEntry?.currentStatus ?? 'no-status'}
        onStatusChange={handleStatusChange}
        isStaff={isStaff}
      />
    </TooltipProvider>
  );
};

// React.memo optimization for ClassResultsTable performance
export const MemoizedClassResultsTable = React.memo(ClassResultsTable, (prevProps, nextProps) => {
  if (prevProps.rawEntries !== nextProps.rawEntries) return false;
  if (prevProps.entries !== nextProps.entries) return false;
  if (prevProps.entries.length !== nextProps.entries.length) return false;
  if (prevProps.userPermissions !== nextProps.userPermissions) return false;
  if (prevProps.classConfig !== nextProps.classConfig) return false;
  return true;
});
