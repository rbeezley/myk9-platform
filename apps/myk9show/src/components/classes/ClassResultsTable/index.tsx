import React, { useState, useMemo } from 'react';
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
import { SearchBar } from '@/components/common/SearchBar';
import { CheckInStatusBadge } from '@/components/common/CheckInStatusBadge';
import { StatusPickerDialog } from '@/components/common/StatusPickerDialog';
import { SubTabs, type SubTabDef } from '@/components/common/SubTabs';
import '@/styles/myk9-show-details.css';
import type { ClassResultsTableProps, ScoringRow, ScoringEdit } from './types';
import type { ScentWorkEntry } from '@/types/scent-work-types';
import type { CheckInStatus } from '@myk9/core';
import { matchesAny } from '@myk9/core';
import { useClassResults } from './useClassResults';
import { getPlacementBadgeClass, formatPlacement } from './utils';
import { DogInfoTooltip } from './DogInfoTooltip';
import { QualificationCell } from './QualificationCell';
import { PendingCell } from './PendingCell';
import { StatusBadge } from './StatusBadge';
import { useViewPreference, CARD_TABLE_MODES } from '@/hooks/useViewPreference';
import { ViewToggle } from '@/components/common/ViewToggle';
import { EntryCardGrid } from './EntryCardGrid';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useCheckInMutation } from '@/hooks/mutations/useCheckInMutation';
import { useVisibleResultFields, deriveClassState } from '@/hooks/useVisibleResultFields';

export type ScoringStatusTab = 'all' | 'pending' | 'completed';

export const ClassResultsTable: React.FC<ClassResultsTableProps> = ({
  entries,
  rawEntries,
  classConfig,
  userPermissions,
  onDeleteEntry,
  onAddEntry,
  className,
  classId,
  showId,
  trialId,
  onOpenRequirements,
  classStatus,
  resultsReleasedAt,
}) => {
  const {
    rows,
    isSubmitting,
    submitError,
    editCount,
    canSubmit,
    onFieldChange,
    clearEntry,
    handleKeyDown,
    handleSubmit,
    isEntryScored,
  } = useClassResults({
    entries,
    rawEntries: rawEntries ?? [],
    classConfig,
    userPermissions,
    classId: classId ?? '',
  });

  const { isExhibitor, isSecretary, isJudge } = useAuthContext();
  const checkInMutation = useCheckInMutation();
  const isStaff = isSecretary || isJudge || !isExhibitor;

  const classState = useMemo(
    () => deriveClassState(classStatus, resultsReleasedAt ?? null),
    [classStatus, resultsReleasedAt]
  );

  const visibility = useVisibleResultFields(showId, trialId, classId, classState);

  const [statusPickerEntry, setStatusPickerEntry] = useState<{
    entryId: string;
    armband: string;
    dogName: string;
    handlerName: string;
    currentStatus: CheckInStatus;
  } | null>(null);

  function handleStatusChange(entryId: string, newStatus: CheckInStatus) {
    checkInMutation.mutate({ entryId, newStatus, classId });
  }

  const entryMap = useMemo(() => new Map(entries.map(e => [e.id, e])), [entries]);

  const showDeleteColumn = !!(userPermissions.canEditEntries && onDeleteEntry);
  const canEdit = userPermissions.canEditEntries;

  const [viewMode, setViewMode] = useViewPreference('class-results', 'table');
  // Guard: card view requires classId for scoring navigation
  const effectiveViewMode = classId ? viewMode : 'table';

  // Scoring status tab filtering (Pending / Completed / All)
  const [scoringTab, setScoringTab] = useState<ScoringStatusTab>('pending');
  const [searchQuery, setSearchQuery] = useState('');

  const scoredEntryIds = useMemo(
    () => new Set(rows.filter(r => r.isScored).map(r => r.entryId)),
    [rows]
  );

  const tabCounts = useMemo(() => {
    const completed = scoredEntryIds.size;
    return { pending: rows.length - completed, completed };
  }, [rows.length, scoredEntryIds]);

  const scoringTabs: SubTabDef[] = useMemo(
    () => [
      { id: 'pending', label: 'Pending', badge: tabCounts.pending },
      { id: 'completed', label: 'Completed', badge: tabCounts.completed },
      { id: 'all', label: 'All' },
    ],
    [tabCounts.pending, tabCounts.completed]
  );

  const filteredRows = useMemo(() => {
    let result = rows;
    if (scoringTab === 'completed') result = result.filter(r => r.isScored);
    else if (scoringTab === 'pending') result = result.filter(r => !r.isScored);
    if (searchQuery) {
      result = result.filter(r => matchesAny([r.dogName, r.handlerName, r.armband], searchQuery));
    }
    return result;
  }, [rows, scoringTab, searchQuery]);

  /** Source entries filtered by the active scoring tab + search (for card view). */
  const filteredEntries = useMemo(() => {
    let result = entries;
    if (scoringTab === 'completed') result = result.filter(e => isEntryScored(e.id));
    else if (scoringTab === 'pending') result = result.filter(e => !isEntryScored(e.id));
    if (searchQuery) {
      result = result.filter(e =>
        matchesAny(
          [e.displayInfo.dogName, e.displayInfo.handlerName, e.displayInfo.armband],
          searchQuery
        )
      );
    }
    return result;
  }, [entries, scoringTab, isEntryScored, searchQuery]);

  const columns: ColumnDef<ScoringRow, unknown>[] = useMemo(() => {
    const cols: ColumnDef<ScoringRow, unknown>[] = [
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
          if (!isStaff && !visibility.showPlacement) {
            return <PendingCell />;
          }
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
          <QualificationCell
            item={row.original}
            canEdit={canEdit}
            visible={isStaff || visibility.showQualification}
            onUpdate={(id, field, value) => onFieldChange(id, field as keyof ScoringEdit, value)}
          />
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
                    item.hasEdits && 'ring-2 ring-blue-500/30'
                  )}
                >
                  <div className="flex items-center gap-1">
                    <TimeInput
                      value={item.searchTime}
                      onChange={digits =>
                        onFieldChange(item.entryId, 'searchTime', formatSearchTime(digits))
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
                        onClick={() => onFieldChange(item.entryId, 'searchTime', '')}
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
          if (!isStaff && !visibility.showTime) {
            return <PendingCell />;
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
                onChange={e => onFieldChange(item.entryId, 'faults', e.target.value)}
                onFocus={e => e.target.select()}
                onKeyDown={e => handleKeyDown(e, row.index, 'faults')}
                min="0"
                max="99"
                className={cn('w-16', item.hasEdits && 'ring-2 ring-blue-500/30 border-blue-500')}
                data-index={row.index}
                data-field="faults"
              />
            );
          }
          if (!isStaff && !visibility.showFaults) {
            return <PendingCell />;
          }
          return <span className="text-sm">{item.faults}</span>;
        },
      },
    ];

    // Check-in column — hidden on Completed tab (always "Completed" there)
    if (scoringTab !== 'completed') {
      // Insert before the last column (Scoring Status)
      cols.push({
        id: 'checkInStatus',
        header: 'Check-in',
        cell: ({ row }) => {
          const item = row.original;
          return (
            <CheckInStatusBadge
              status={item.checkInStatus}
              size="sm"
              onClick={() =>
                setStatusPickerEntry({
                  entryId: item.entryId,
                  armband: item.armband ?? '',
                  dogName: item.dogName ?? 'Unknown',
                  handlerName: item.handlerName ?? '',
                  currentStatus: item.checkInStatus,
                })
              }
            />
          );
        },
      });
    }

    // Scoring Status
    cols.push({
      id: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge item={row.original} />,
    });

    // Clear result column
    if (canEdit) {
      cols.push({
        id: 'clearResult',
        header: '',
        cell: ({ row }) => {
          const item = row.original;
          if (!item.isScored && !item.hasEdits) return null;
          return (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => clearEntry(item.entryId)}
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
          // Hide delete on scored entries — reset first, then delete from Pending
          if (item.isScored) return null;
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
    clearEntry,
    entryMap,
    handleKeyDown,
    isStaff,
    onDeleteEntry,
    onFieldChange,
    scoringTab,
    showDeleteColumn,
    visibility,
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

          <div className="px-4 pt-3">
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search by dog, handler, or armband..."
              aria-label="Search entries"
              size="sm"
              className="max-w-sm"
            />
          </div>

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
              <DataTable<ScoringRow>
                tableId="classResults"
                columns={columns}
                data={filteredRows}
                getRowId={row => row.entryId}
                pageSize={9999}
              />

              {userPermissions.canEditEntries && (
                <div className="flex items-center justify-between border-t border-border/50 px-4 py-3">
                  <div className="text-sm text-muted-foreground">
                    Press Enter or Tab to move between fields &bull; Placements calculated on submit
                  </div>
                  <Button
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    className="myk9-action-button myk9-action-button-primary"
                  >
                    <Save className="h-4 w-4" />
                    <span>
                      {isSubmitting
                        ? 'Submitting...'
                        : `Submit ${editCount} Result${editCount !== 1 ? 's' : ''}`}
                    </span>
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
        disabled={!isStaff && !visibility.selfCheckinEnabled}
      />
    </TooltipProvider>
  );
};

// React.memo optimization for ClassResultsTable performance
export const MemoizedClassResultsTable = React.memo(ClassResultsTable, (prevProps, nextProps) => {
  if (prevProps.rawEntries !== nextProps.rawEntries) return false;
  if (prevProps.entries !== nextProps.entries) return false;
  if (prevProps.userPermissions !== nextProps.userPermissions) return false;
  return true;
});
