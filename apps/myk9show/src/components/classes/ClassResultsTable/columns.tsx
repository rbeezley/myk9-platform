import { useMemo } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { ArmbandBadge } from '@/components/common/ArmbandBadge';
import { DogInfoTooltip } from './DogInfoTooltip';
import { QualificationCell } from './QualificationCell';
import { StatusBadge } from './StatusBadge';
import { PlacementCell } from './PlacementCell';
import { SearchTimeCell } from './SearchTimeCell';
import { FaultsCell } from './FaultsCell';
import type { ScoringRow } from './types';
import type { ScentWorkEntry } from '@/types/scent-work-types';

interface UseResultColumnsParams {
  /** Staff are shown every result column; everyone else only what the class makes visible. */
  isStaff: boolean;
  visibility: {
    showPlacement: boolean;
    showQualification: boolean;
    showTime: boolean;
    showFaults: boolean;
  };
  entryMap: Map<string, ScentWorkEntry>;
}

/** Read-only columns: the class page has no check-in, score, delete or reorder control. */
export function useResultColumns(params: UseResultColumnsParams): ColumnDef<ScoringRow, unknown>[] {
  const { isStaff, visibility, entryMap } = params;

  return useMemo(
    () => [
      {
        id: 'armband',
        accessorKey: 'armband',
        header: 'Armband',
        sortingFn: 'basic',
        cell: ({ row }) => <ArmbandBadge armband={row.original.armband} />,
      },
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
      {
        id: 'placement',
        accessorKey: 'placement',
        header: 'Placement',
        cell: ({ row }) => (
          <PlacementCell item={row.original} visible={isStaff || visibility.showPlacement} />
        ),
      },
      {
        id: 'qualification',
        accessorKey: 'qualification',
        header: 'Qualification',
        cell: ({ row }) => (
          <QualificationCell
            item={row.original}
            visible={isStaff || visibility.showQualification}
          />
        ),
      },
      {
        id: 'searchTime',
        accessorKey: 'searchTime',
        header: 'Search Time',
        cell: ({ row }) => (
          <SearchTimeCell item={row.original} visible={isStaff || visibility.showTime} />
        ),
      },
      {
        id: 'faults',
        accessorKey: 'faults',
        header: 'Faults',
        cell: ({ row }) => (
          <FaultsCell item={row.original} visible={isStaff || visibility.showFaults} />
        ),
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusBadge item={row.original} />,
      },
    ],
    [isStaff, visibility, entryMap]
  );
}
