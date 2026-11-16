import React, { useMemo } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { Trash2, Eraser } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ArmbandBadge } from '@/components/common/ArmbandBadge';
import { CheckInStatusBadge } from '@/components/common/CheckInStatusBadge';
import { DogInfoTooltip } from './DogInfoTooltip';
import { QualificationCell } from './QualificationCell';
import { StatusBadge } from './StatusBadge';
import { PlacementCell } from './PlacementCell';
import { SearchTimeCell } from './SearchTimeCell';
import { FaultsCell } from './FaultsCell';
import type { ScoringRow, ScoringEdit } from './types';
import type { ScentWorkEntry } from '@/types/scent-work-types';
import type { CheckInStatus } from '@myk9/core';
import type { ScoringStatusTab } from './index';

interface UseResultColumnsParams {
  canEdit: boolean;
  isStaff: boolean;
  visibility: {
    showPlacement: boolean;
    showQualification: boolean;
    showTime: boolean;
    showFaults: boolean;
  };
  scoringTab: ScoringStatusTab;
  showDeleteColumn: boolean;
  entryMap: Map<string, ScentWorkEntry>;
  onFieldChange: (entryId: string, field: keyof ScoringEdit, value: string) => void;
  handleKeyDown: (e: React.KeyboardEvent, rowIndex: number, field: string) => void;
  clearEntry: (entryId: string) => void;
  onDeleteEntry?: ((entryId: string) => void) | undefined;
  onCheckInClick: (entry: {
    entryId: string;
    armband: string;
    dogName: string;
    handlerName: string;
    currentStatus: CheckInStatus;
  }) => void;
}

export function useResultColumns(params: UseResultColumnsParams): ColumnDef<ScoringRow, unknown>[] {
  const {
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
    onCheckInClick,
  } = params;

  return useMemo(() => {
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
        cell: ({ row }) => (
          <PlacementCell item={row.original} visible={isStaff || visibility.showPlacement} />
        ),
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
        cell: ({ row }) => (
          <SearchTimeCell
            item={row.original}
            canEdit={canEdit}
            visible={isStaff || visibility.showTime}
            rowIndex={row.index}
            onFieldChange={(id, field, value) => onFieldChange(id, field, value)}
          />
        ),
      },
      // Faults
      {
        id: 'faults',
        accessorKey: 'faults',
        header: 'Faults',
        cell: ({ row }) => (
          <FaultsCell
            item={row.original}
            canEdit={canEdit}
            visible={isStaff || visibility.showFaults}
            rowIndex={row.index}
            onFieldChange={(id, field, value) => onFieldChange(id, field, value)}
            onKeyDown={handleKeyDown}
          />
        ),
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
                onCheckInClick({
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
              className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
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
    onCheckInClick,
  ]);
}
