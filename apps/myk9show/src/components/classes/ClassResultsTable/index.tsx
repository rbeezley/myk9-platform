import React, { useState, useMemo } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { Save, AlertCircle, ClipboardList, Plus, ListOrdered } from 'lucide-react';
import { useRunOrderDrag } from './useRunOrderDrag';
import { DragHandleCell } from './SortableRow';
import { DndTableView } from './DndTableView';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TooltipProvider } from '@/components/ui/tooltip/tooltip';
import { DataTable } from '@/components/ui/data-table';
import { SearchBar } from '@/components/common/SearchBar';
import { StatusPickerDialog } from '@/components/common/StatusPickerDialog';
import { RunOrderDialog } from '../RunOrderDialog';
import { useRunOrderPreset } from './useRunOrderPreset';
import { PrimaryTabs, type PrimaryTabDef } from '@/components/common/PrimaryTabs';
import '@/styles/myk9-show-details.css';
import type { ClassResultsTableProps, ScoringRow } from './types';
import type { CheckInStatus } from '@myk9/core';
import { matchesAny } from '@myk9/core';
import { useClassResults } from './useClassResults';
import { useResultColumns } from './columns';
import { useViewPreference, CARD_TABLE_MODES } from '@/hooks/useViewPreference';
import { ViewToggle } from '@/components/common/ViewToggle';
import { EntryCardGrid } from './EntryCardGrid';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useCheckInMutation } from '@/hooks/mutations/useCheckInMutation';
import { useVisibleResultFields, deriveClassState } from '@/hooks/useVisibleResultFields';

export type ScoringStatusTab = 'all' | 'pending' | 'completed';

const DRAG_HANDLE_COL: ColumnDef<ScoringRow, unknown> = {
  id: 'dragHandle',
  header: '',
  enableSorting: false,
  cell: () => <DragHandleCell />,
};

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
  const isStaff = isSecretary || isJudge || !isExhibitor;
  const checkInMutation = useCheckInMutation({
    writer: isStaff ? 'replicated' : 'self-checkin-rpc',
  });

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

  const [runOrderDialogOpen, setRunOrderDialogOpen] = useState(false);
  const { applyPreset } = useRunOrderPreset(classId, rawEntries ?? []);

  function handleStatusChange(entryId: string, newStatus: CheckInStatus) {
    checkInMutation.mutate({ entryId, newStatus, classId });
  }

  const entryMap = useMemo(() => new Map(entries.map(e => [e.id, e])), [entries]);

  const showDeleteColumn = !!(userPermissions.canEditEntries && onDeleteEntry);
  const canEdit = userPermissions.canEditEntries;

  const isClosed = classStatus === 'closed';

  const [viewMode, setViewMode] = useViewPreference('class-results', 'table');
  // Guard: card view requires classId for scoring navigation
  const effectiveViewMode = classId ? viewMode : 'table';

  // Scoring status tab filtering (Pending / Completed / All).
  // Read-only viewers (exhibitors/guests) on a results-released class have no
  // pending entries to score, so default them to "All" — otherwise the default
  // "Pending" tab renders empty and the released results look missing.
  const readOnlyReleased = !canEdit && !!resultsReleasedAt;
  const [scoringTab, setScoringTab] = useState<ScoringStatusTab>(
    readOnlyReleased ? 'all' : 'pending'
  );
  // If results are released while a read-only viewer already has the page open,
  // flip them off the (now-empty) "Pending" tab. Adjust-state-during-render
  // pattern (not an effect — the repo lints against setState-in-effect).
  const [wasReadOnlyReleased, setWasReadOnlyReleased] = useState(readOnlyReleased);
  if (readOnlyReleased !== wasReadOnlyReleased) {
    setWasReadOnlyReleased(readOnlyReleased);
    if (readOnlyReleased) setScoringTab('all');
  }
  const [searchQuery, setSearchQuery] = useState('');

  const scoredEntryIds = useMemo(
    () => new Set(rows.filter(r => r.isScored).map(r => r.entryId)),
    [rows]
  );

  const tabCounts = useMemo(() => {
    const completed = scoredEntryIds.size;
    return { pending: rows.length - completed, completed };
  }, [rows, scoredEntryIds]);

  const scoringTabs: PrimaryTabDef[] = useMemo(
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

  const showDragHandles = canEdit && !isClosed && scoringTab !== 'completed' && !searchQuery;

  const { orderedIds, sensors, onDragEnd } = useRunOrderDrag({
    rawEntries: rawEntries ?? [],
  });

  const dndOrderedRows = useMemo(() => {
    const rowById = new Map(filteredRows.map(r => [r.entryId, r]));
    return orderedIds.map(id => rowById.get(id)).filter((r): r is ScoringRow => r !== undefined);
  }, [orderedIds, filteredRows]);

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

  const columns = useResultColumns({
    canEdit,
    isStaff,
    visibility,
    scoringTab,
    showDeleteColumn,
    entryMap,
    onFieldChange,
    handleKeyDown,
    clearEntry,
    onDeleteEntry,
    onCheckInClick: setStatusPickerEntry,
  });

  const dragColumns = useMemo<ColumnDef<ScoringRow, unknown>[]>(
    () => (showDragHandles ? [DRAG_HANDLE_COL, ...columns] : columns),
    [showDragHandles, columns]
  );

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
              {canEdit && !isClosed && (
                <Button variant="outline" size="sm" onClick={() => setRunOrderDialogOpen(true)}>
                  <ListOrdered className="h-4 w-4" />
                  <span>Set Run Order</span>
                </Button>
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

          <PrimaryTabs
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
              {showDragHandles ? (
                <DndTableView
                  columns={dragColumns}
                  orderedRows={dndOrderedRows}
                  sensors={sensors}
                  onDragEnd={onDragEnd}
                />
              ) : (
                <DataTable<ScoringRow>
                  tableId="classResults"
                  columns={columns}
                  data={filteredRows}
                  getRowId={row => row.entryId}
                  pageSize={9999}
                />
              )}

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
      <RunOrderDialog
        open={runOrderDialogOpen}
        onOpenChange={setRunOrderDialogOpen}
        entries={rawEntries ?? []}
        onApply={applyPreset}
      />
    </TooltipProvider>
  );
};

// React.memo optimization for ClassResultsTable performance
export const MemoizedClassResultsTable = React.memo(ClassResultsTable, (prevProps, nextProps) => {
  if (prevProps.rawEntries !== nextProps.rawEntries) return false;
  if (prevProps.entries !== nextProps.entries) return false;
  if (prevProps.userPermissions !== nextProps.userPermissions) return false;
  if (prevProps.classId !== nextProps.classId) return false;
  if (prevProps.classStatus !== nextProps.classStatus) return false;
  if (prevProps.resultsReleasedAt !== nextProps.resultsReleasedAt) return false;
  return true;
});
