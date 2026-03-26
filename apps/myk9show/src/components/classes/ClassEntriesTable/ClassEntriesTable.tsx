import React, { useState, useMemo, useCallback } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { Plus, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  DataTableToolbar,
  DataTableSearch,
  DataTableColumnToggle,
} from '@/components/ui/data-table';
import { UnifiedEntryData } from '@/types/unified-entry-types';
import { useTableConfiguration } from '@/hooks/useTableConfiguration';
import { cn } from '@/lib/utils';
import { StatusFilter, type StatusFilterValue } from '@/components/common/StatusFilter';
import { FilterEmptyState } from '@/components/common/FilterEmptyState';
import { ClassEntriesTableProps, DEFAULT_PERMISSIONS } from './types';
import { EntryData } from '../types/classTypes';
import { useInlineEditing } from './hooks/useInlineEditing';
import { downloadEntriesAsCSV } from './utils';
import { DeleteDialog } from './components/DeleteDialog';
import { EntryActionsMenu } from './components/EntryActionsMenu';
import { InlineEditingToolbar } from './components/InlineEditingToolbar';
import { SaveBar } from './components/SaveBar';
import { SummaryFooter } from './components/SummaryFooter';
import { renderCell } from './components/renderCell';
import { EntriesStatisticsPanel } from '../EntriesStatisticsPanel';
import '@/styles/myk9-show-details.css';

export const COMPLETED_STATUSES = new Set([
  'Qualified',
  'Not Qualified',
  'Absent',
  'Excused',
  'Withdrawn',
  'Eliminated',
]);

const EMPTY_EDIT_ENTRY: import('./types').InlineEditEntry = {
  time: '',
  status: '',
  score: '',
  placement: '',
  isValid: true,
  hasChanges: false,
  errors: [],
  originalData: { time: '', status: '', score: '', placement: '' },
};

export interface DisplayRow {
  unified: UnifiedEntryData;
  entry: EntryData;
  transformed: Record<string, unknown>;
}

const ClassEntriesTable: React.FC<ClassEntriesTableProps> = ({
  entries,
  trialType,
  template,
  onViewEntry,
  onEditEntry,
  onEnterResults,
  onDeleteEntry,
  onAddEntry,
  enableInlineEditing = false,
  onResultUpdate,
  onToggleInlineEditing,
  userPermissions,
  className,
}) => {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<EntryData | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all');

  const permissions = userPermissions || DEFAULT_PERMISSIONS;

  const {
    inlineEditData,
    isSubmitting,
    submitError,
    autoSaveEnabled,
    changesSummary,
    updateInlineEditData,
    getEditData,
    handleSubmitChanges,
    setAutoSaveEnabled,
    clearEditData,
  } = useInlineEditing({
    entries,
    onResultUpdate,
    canSubmitResults: permissions.canSubmitResults,
  });

  const { columns: tableColumns, transformEntry } = useTableConfiguration({
    trialType,
    template,
  });

  const unifiedEntries = useMemo(() => {
    return entries.map(entry => {
      const unified: UnifiedEntryData = {
        id: entry.id,
        classId: entry.classId,
        armband: entry.armband,
        handler: entry.handler,
        dog: entry.dog,
        status: entry.status,
        time: entry.time,
        score: entry.score,
        placement: entry.placement,
        trialType,
      };
      return unified;
    });
  }, [entries, trialType]);

  const statusCounts = useMemo(() => {
    let completed = 0;
    for (const entry of entries) {
      if (COMPLETED_STATUSES.has(entry.status)) completed++;
    }
    return { all: entries.length, pending: entries.length - completed, completed };
  }, [entries]);

  // Single pass: filter + build display rows (entries[i] and unifiedEntries[i] are always paired)
  const displayRows: DisplayRow[] = useMemo(() => {
    const rows: DisplayRow[] = [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (statusFilter !== 'all') {
        const isCompleted = COMPLETED_STATUSES.has(entry.status);
        if (statusFilter === 'completed' ? !isCompleted : isCompleted) continue;
      }
      rows.push({
        unified: unifiedEntries[i],
        entry,
        transformed: transformEntry(unifiedEntries[i]),
      });
    }
    return rows;
  }, [entries, unifiedEntries, statusFilter, transformEntry]);

  const handleDeleteClick = useCallback((entry: EntryData) => {
    setEntryToDelete(entry);
    setDeleteDialogOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (entryToDelete) {
      onDeleteEntry(entryToDelete.id);
    }
    setDeleteDialogOpen(false);
    setEntryToDelete(null);
  }, [entryToDelete, onDeleteEntry]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, _entryId: string, field: string, rowIndex: number) => {
      const { key, shiftKey, ctrlKey, metaKey } = event;

      if ((ctrlKey || metaKey) && key === 's') {
        event.preventDefault();
        handleSubmitChanges();
        return;
      }

      if (key === 'Escape') {
        event.preventDefault();
        clearEditData();
        return;
      }

      if (key === 'Enter' || key === 'Tab') {
        event.preventDefault();
        const fieldOrder = ['time', 'status', 'score', 'placement'];
        const currentFieldIndex = fieldOrder.indexOf(field);

        let nextField: string;
        let nextRowIndex = rowIndex;

        if (shiftKey) {
          if (currentFieldIndex > 0) {
            nextField = fieldOrder[currentFieldIndex - 1];
          } else if (rowIndex > 0) {
            nextRowIndex = rowIndex - 1;
            nextField = fieldOrder[fieldOrder.length - 1];
          } else {
            return;
          }
        } else {
          if (currentFieldIndex < fieldOrder.length - 1) {
            nextField = fieldOrder[currentFieldIndex + 1];
          } else if (rowIndex < displayRows.length - 1) {
            nextRowIndex = rowIndex + 1;
            nextField = fieldOrder[0];
          } else {
            return;
          }
        }

        const nextEntryId = displayRows[nextRowIndex]?.entry.id;
        if (nextEntryId) {
          const nextInput = document.querySelector(
            `input[data-entry-id="${nextEntryId}"][data-field="${nextField}"], select[data-entry-id="${nextEntryId}"][data-field="${nextField}"]`
          ) as HTMLElement;
          if (nextInput) nextInput.focus();
        }
      }
    },
    [displayRows, handleSubmitChanges, clearEditData]
  );

  const handleExportCSV = useCallback(() => {
    if (permissions.canExportData) {
      downloadEntriesAsCSV(entries);
    }
  }, [entries, permissions.canExportData]);

  const columnDefs: ColumnDef<DisplayRow, unknown>[] = useMemo(() => {
    const cols: ColumnDef<DisplayRow, unknown>[] = tableColumns.map(column => ({
      id: column.id,
      accessorFn: (row: DisplayRow) => {
        const cellData = row.transformed[column.id] as Record<string, unknown> | undefined;
        return cellData?.raw ?? '';
      },
      header:
        column.id === 'time' && enableInlineEditing
          ? () => (
              <div className="flex justify-center gap-1">
                <span className="w-12 text-center">Min</span>
                <span className="w-4 text-center">:</span>
                <span className="w-12 text-center">Sec</span>
                <span className="w-4 text-center">.</span>
                <span className="w-12 text-center">1/100</span>
              </div>
            )
          : column.label,
      enableSorting: column.sortable,
      cell: ({ row }) =>
        renderCell({
          row,
          columnId: column.id,
          dataType: column.dataType,
          enableInlineEditing,
          getEditData,
          updateInlineEditData,
          handleKeyDown,
          align: column.align,
        }),
    }));

    cols.push({
      id: 'actions',
      header: () => <div className="text-center">Actions</div>,
      enableSorting: false,
      cell: ({ row }) => {
        const entry = row.original.entry;
        const editData = enableInlineEditing ? getEditData(entry) : EMPTY_EDIT_ENTRY;
        return (
          <div className="text-center">
            <EntryActionsMenu
              entry={entry}
              enableInlineEditing={enableInlineEditing}
              editData={editData}
              onView={() => (onViewEntry ? onViewEntry(entry.id) : onEditEntry(entry.id))}
              onEdit={() => onEditEntry(entry.id)}
              onEnterResults={() =>
                onEnterResults ? onEnterResults(entry.id) : onEditEntry(entry.id)
              }
              onDelete={() => handleDeleteClick(entry)}
            />
          </div>
        );
      },
    });

    return cols;
  }, [
    tableColumns,
    enableInlineEditing,
    getEditData,
    updateInlineEditData,
    handleKeyDown,
    onViewEntry,
    onEditEntry,
    onEnterResults,
    handleDeleteClick,
  ]);

  if (entries.length === 0) {
    return (
      <div className={cn('space-y-6', className)}>
        {permissions.canViewStatistics && (
          <EntriesStatisticsPanel entries={entries} editData={inlineEditData} />
        )}
        <div className="text-center py-12 bg-muted/30 rounded-lg border border-dashed border-muted-foreground/20">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <Plus className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2">No entries yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Add the first entry to get started with this class.
              </p>
              {permissions.canAddEntries && (
                <Button
                  onClick={onAddEntry}
                  className="myk9-action-button myk9-action-button-primary"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Entry
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const filterEmptyState =
    displayRows.length === 0 && entries.length > 0 ? (
      <FilterEmptyState
        noun="entries"
        statusFilter={statusFilter}
        onReset={() => setStatusFilter('all')}
        allDoneMessage="All entries have results!"
        noneDoneMessage="No entries have results yet."
      />
    ) : undefined;

  return (
    <div className={cn('space-y-6', className)}>
      {permissions.canViewStatistics && (
        <EntriesStatisticsPanel entries={entries} editData={inlineEditData} />
      )}

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
            {permissions.canExportData && (
              <Button variant="outline" onClick={handleExportCSV} className="myk9-action-button">
                <Download className="h-4 w-4" />
                <span>Export CSV</span>
              </Button>
            )}
            {permissions.canAddEntries && (
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

      <StatusFilter filter={statusFilter} onFilterChange={setStatusFilter} counts={statusCounts} />

      <InlineEditingToolbar
        enableInlineEditing={enableInlineEditing}
        canEditResults={permissions.canEditResults}
        canBulkEdit={permissions.canBulkEdit}
        canAccessAdvancedFeatures={permissions.canAccessAdvancedFeatures}
        hasResultUpdate={!!onResultUpdate}
        autoSaveEnabled={autoSaveEnabled}
        changesSummary={changesSummary}
        userRole={permissions.role}
        onToggleInlineEditing={onToggleInlineEditing}
        onToggleAutoSave={() => setAutoSaveEnabled(!autoSaveEnabled)}
      />

      <DataTable<DisplayRow>
        tableId="classEntries"
        columns={columnDefs}
        data={displayRows}
        getRowId={row => row.entry.id}
        pageSize={9999}
        emptyState={filterEmptyState}
        toolbar={({ table }) => (
          <DataTableToolbar table={table}>
            <DataTableSearch placeholder="Search entries..." />
            <DataTableColumnToggle />
          </DataTableToolbar>
        )}
      />

      {enableInlineEditing && (
        <SaveBar
          changesSummary={changesSummary}
          isSubmitting={isSubmitting}
          submitError={submitError}
          onSubmit={handleSubmitChanges}
        />
      )}

      <SummaryFooter entries={entries} />

      <DeleteDialog
        open={deleteDialogOpen}
        entry={entryToDelete}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
};

export default React.memo(ClassEntriesTable, (prevProps, nextProps) => {
  if (prevProps.entries.length !== nextProps.entries.length) return false;
  if (prevProps.trialType !== nextProps.trialType) return false;
  if (prevProps.enableInlineEditing !== nextProps.enableInlineEditing) return false;
  if (prevProps.template?.id !== nextProps.template?.id) return false;

  for (let i = 0; i < prevProps.entries.length; i++) {
    const prevEntry = prevProps.entries[i];
    const nextEntry = nextProps.entries[i];

    if (
      prevEntry.id !== nextEntry.id ||
      prevEntry.armband !== nextEntry.armband ||
      prevEntry.handler !== nextEntry.handler ||
      prevEntry.dog !== nextEntry.dog ||
      prevEntry.status !== nextEntry.status ||
      prevEntry.score !== nextEntry.score ||
      prevEntry.time !== nextEntry.time ||
      prevEntry.placement !== nextEntry.placement
    ) {
      return false;
    }
  }

  return true;
});
