/**
 * ClassEntriesTable Component
 *
 * Table component for displaying and managing class entries with inline editing support.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { UnifiedEntryData } from '@/types/unified-entry-types';
import { useTableConfiguration } from '@/hooks/useTableConfiguration';
import { cn } from '@/lib/utils';
import { StatusFilter, type StatusFilterValue } from '@/components/common/StatusFilter';

// Types
import { ClassEntriesTableProps, DEFAULT_PERMISSIONS } from './types';
import { EntryData } from '../types/classTypes';

// Hooks
import { useInlineEditing } from './hooks/useInlineEditing';

// Utils
import { getStatusColor, getPlacementStyle, downloadEntriesAsCSV } from './utils';

// Components
import { EmptyState } from './components/EmptyState';
import { ErrorDisplay } from './components/ErrorDisplay';
import { EntriesTableHeader } from './components/EntriesTableHeader';
import { InlineEditingToolbar } from './components/InlineEditingToolbar';
import { StatusCell, TimeCell, ScoreCell, PlacementCell } from './components/EditableCells';
import { SaveBar } from './components/SaveBar';
import { SummaryFooter } from './components/SummaryFooter';
import { DeleteDialog } from './components/DeleteDialog';
import { EntryActionsMenu } from './components/EntryActionsMenu';

// Statistics panel
import { EntriesStatisticsPanel } from '../EntriesStatisticsPanel';

// styles
import '@/styles/myk9-show-details.css';

const COMPLETED_STATUSES = new Set([
  'Qualified',
  'Not Qualified',
  'Absent',
  'Excused',
  'Withdrawn',
  'Eliminated',
]);

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
  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<EntryData | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all');

  // Default permissions if none provided
  const permissions = userPermissions || DEFAULT_PERMISSIONS;

  // Inline editing hook
  const {
    inlineEditData,
    errors,
    isSubmitting,
    submitError,
    autoSaveEnabled,
    changesSummary,
    initializeEditData,
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

  // Get table configuration based on show type and template
  const { columns, transformEntry } = useTableConfiguration({
    trialType,
    template,
  });

  // Transform entries to unified format for consistent display
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

  const filteredEntries = useMemo(() => {
    if (statusFilter === 'all') return entries;
    return entries.filter(entry => {
      const isCompleted = COMPLETED_STATUSES.has(entry.status);
      return statusFilter === 'completed' ? isCompleted : !isCompleted;
    });
  }, [entries, statusFilter]);

  const filteredUnifiedEntries = useMemo(() => {
    if (statusFilter === 'all') return unifiedEntries;
    const filteredIds = new Set(filteredEntries.map(e => e.id));
    return unifiedEntries.filter(e => filteredIds.has(e.id));
  }, [unifiedEntries, statusFilter, filteredEntries]);

  // Delete handlers
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

  // Keyboard navigation handler
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, _entryId: string, field: string, rowIndex: number) => {
      const { key, shiftKey, ctrlKey, metaKey } = event;

      // Handle Ctrl/Cmd + S to save
      if ((ctrlKey || metaKey) && key === 's') {
        event.preventDefault();
        handleSubmitChanges();
        return;
      }

      // Handle Escape to cancel editing
      if (key === 'Escape') {
        event.preventDefault();
        clearEditData();
        return;
      }

      // Handle Tab and Enter navigation
      if (key === 'Enter' || key === 'Tab') {
        event.preventDefault();

        const fieldOrder = ['time', 'status', 'score', 'placement'];
        const currentFieldIndex = fieldOrder.indexOf(field);

        let nextField: string;
        let nextRowIndex = rowIndex;

        if (shiftKey) {
          // Navigate backwards
          if (currentFieldIndex > 0) {
            nextField = fieldOrder[currentFieldIndex - 1];
          } else if (rowIndex > 0) {
            nextRowIndex = rowIndex - 1;
            nextField = fieldOrder[fieldOrder.length - 1];
          } else {
            return;
          }
        } else {
          // Navigate forwards
          if (currentFieldIndex < fieldOrder.length - 1) {
            nextField = fieldOrder[currentFieldIndex + 1];
          } else if (rowIndex < entries.length - 1) {
            nextRowIndex = rowIndex + 1;
            nextField = fieldOrder[0];
          } else {
            return;
          }
        }

        // Find and focus next input
        const nextEntryId = entries[nextRowIndex]?.id;
        if (nextEntryId) {
          const nextInput = document.querySelector(
            `input[data-entry-id="${nextEntryId}"][data-field="${nextField}"], select[data-entry-id="${nextEntryId}"][data-field="${nextField}"]`
          ) as HTMLElement;

          if (nextInput) {
            nextInput.focus();
          }
        }
      }
    },
    [entries, handleSubmitChanges, clearEditData]
  );

  // CSV export handler
  const handleExportCSV = useCallback(() => {
    if (permissions.canExportData) {
      downloadEntriesAsCSV(entries);
    }
  }, [entries, permissions.canExportData]);

  // Empty state
  if (entries.length === 0) {
    return (
      <div className={cn('space-y-6', className)}>
        {permissions.canViewStatistics && (
          <EntriesStatisticsPanel entries={entries} editData={inlineEditData} />
        )}
        <EmptyState onAddEntry={onAddEntry} canAddEntries={permissions.canAddEntries} />
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Statistics Panel */}
      {permissions.canViewStatistics && (
        <EntriesStatisticsPanel entries={entries} editData={inlineEditData} />
      )}

      {/* Error Display */}
      <ErrorDisplay errors={errors} />

      {/* Header */}
      <EntriesTableHeader
        enableInlineEditing={enableInlineEditing}
        canExportData={permissions.canExportData}
        canAddEntries={permissions.canAddEntries}
        onExportCSV={handleExportCSV}
        onAddEntry={onAddEntry}
      />

      {/* Status Filter */}
      <StatusFilter
        filter={statusFilter}
        onFilterChange={setStatusFilter}
        counts={statusCounts}
      />

      {/* Inline Editing Toolbar */}
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

      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              {columns.map(column => (
                <TableHead
                  key={column.id}
                  className={`font-semibold ${column.align === 'center' ? 'text-center' : column.align === 'right' ? 'text-right' : ''}`}
                  style={{ width: column.width }}
                >
                  {column.id === 'time' ? (
                    <div className="flex justify-center gap-1">
                      <span className="w-12 text-center">Min</span>
                      <span className="w-4 text-center">:</span>
                      <span className="w-12 text-center">Sec</span>
                      <span className="w-4 text-center">.</span>
                      <span className="w-12 text-center">1/100</span>
                    </div>
                  ) : (
                    column.label
                  )}
                </TableHead>
              ))}
              <TableHead className="font-semibold text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUnifiedEntries.map((entry, index) => {
              const transformedEntry = transformEntry(entry);
              const originalEntry = filteredEntries[index];
              const editData = getEditData(originalEntry);

              // Initialize edit data if inline editing is enabled
              if (enableInlineEditing) {
                initializeEditData(originalEntry);
              }

              return (
                <TableRow
                  key={entry.id}
                  className={cn(
                    'hover:bg-muted/50 transition-colors border-b border-border/50',
                    enableInlineEditing &&
                      editData.hasChanges &&
                      !editData.isValid &&
                      'bg-red-50 dark:bg-red-950/20'
                  )}
                >
                  {columns.map(column => {
                    const cellData = transformedEntry[column.id] as Record<string, unknown>;
                    const rawValue = cellData?.raw;
                    const formattedValue = cellData?.formatted || '--';
                    const cellClassName = cellData?.className || '';

                    const isEditableColumn =
                      enableInlineEditing &&
                      ['time', 'status', 'score', 'placement'].includes(column.id);

                    return (
                      <TableCell
                        key={column.id}
                        className={`${column.className || ''} ${cellClassName} ${column.align === 'center' ? 'text-center' : column.align === 'right' ? 'text-right' : ''} ${column.id === 'time' && isEditableColumn ? 'align-top' : ''}`}
                      >
                        {isEditableColumn ? (
                          // Render editable field
                          column.id === 'status' ? (
                            <StatusCell
                              entryId={originalEntry.id}
                              value={editData.status}
                              errors={editData.errors}
                              onUpdate={value =>
                                updateInlineEditData(originalEntry.id, 'status', value)
                              }
                            />
                          ) : column.id === 'time' ? (
                            <TimeCell
                              entryId={originalEntry.id}
                              value={editData.time}
                              errors={editData.errors}
                              onUpdate={value =>
                                updateInlineEditData(originalEntry.id, 'time', value)
                              }
                              onKeyDown={e => handleKeyDown(e, originalEntry.id, 'time', index)}
                            />
                          ) : column.id === 'score' ? (
                            <ScoreCell
                              entryId={originalEntry.id}
                              value={editData.score}
                              errors={editData.errors}
                              onUpdate={value =>
                                updateInlineEditData(originalEntry.id, 'score', value)
                              }
                              onKeyDown={e => handleKeyDown(e, originalEntry.id, 'score', index)}
                            />
                          ) : column.id === 'placement' ? (
                            <PlacementCell
                              entryId={originalEntry.id}
                              value={editData.placement}
                              errors={editData.errors}
                              onUpdate={value =>
                                updateInlineEditData(originalEntry.id, 'placement', value)
                              }
                              onKeyDown={e =>
                                handleKeyDown(e, originalEntry.id, 'placement', index)
                              }
                            />
                          ) : (
                            String(formattedValue || '')
                          )
                        ) : // Render readonly field
                        column.dataType === 'status' ? (
                          <Badge
                            variant="secondary"
                            className={`${getStatusColor(String(formattedValue || ''))} border-0`}
                          >
                            {String(formattedValue || '')}
                          </Badge>
                        ) : column.dataType === 'placement' ? (
                          <span className={getPlacementStyle(String(rawValue || ''))}>
                            {String(formattedValue || '')}
                          </span>
                        ) : (
                          String(formattedValue || '')
                        )}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-center">
                    <EntryActionsMenu
                      entry={originalEntry}
                      enableInlineEditing={enableInlineEditing}
                      editData={editData}
                      onView={() =>
                        onViewEntry ? onViewEntry(originalEntry.id) : onEditEntry(originalEntry.id)
                      }
                      onEdit={() => onEditEntry(originalEntry.id)}
                      onEnterResults={() =>
                        onEnterResults
                          ? onEnterResults(originalEntry.id)
                          : onEditEntry(originalEntry.id)
                      }
                      onDelete={() => handleDeleteClick(originalEntry)}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Inline Editing Save Bar */}
      {enableInlineEditing && (
        <SaveBar
          changesSummary={changesSummary}
          isSubmitting={isSubmitting}
          submitError={submitError}
          onSubmit={handleSubmitChanges}
        />
      )}

      {/* Summary Footer */}
      <SummaryFooter entries={entries} />

      {/* Delete Confirmation Dialog */}
      <DeleteDialog
        open={deleteDialogOpen}
        entry={entryToDelete}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
};

// React.memo optimization with custom comparison for performance
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
