import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { type ColumnDef, type DisplayColumnDef } from '@tanstack/react-table';
import { getDogDisplayName, getDogBreedLabel, type Dog, type DogStatus } from '@/types/dog-types';
import { DataTable, type DataTableColumnMeta } from '@/components/ui/data-table';

/** Minimal selection surface (a subset of `useBulkSelection`) for the select column —
 * mirrors `EntriesTableSelection` (design.md decision D2: DataTable opt-in bridged
 * to the shared selection hook rather than DataTable's own uncontrolled selection
 * state, so the bulk bar contract is identical across surfaces). */
export interface DogsTableSelection {
  isSelected: (dog: Dog) => boolean;
  toggleItem: (dog: Dog) => void;
  isAllSelected: boolean;
  isPartiallySelected: boolean;
  toggleAll: () => void;
}

interface DogsTableViewProps {
  dogs: Dog[];
  /** When provided, renders a leading checkbox select column wired to this selection. */
  selection?: DogsTableSelection | undefined;
}

function buildSelectColumn(selection: DogsTableSelection): DisplayColumnDef<Dog, unknown> {
  return {
    id: '_select',
    header: () => (
      <Checkbox
        checked={selection.isAllSelected}
        indeterminate={selection.isPartiallySelected}
        onCheckedChange={() => selection.toggleAll()}
        aria-label="Select all dogs"
      />
    ),
    cell: ({ row }) => (
      <span className="flex items-center" onClick={e => e.stopPropagation()} role="presentation">
        <Checkbox
          checked={selection.isSelected(row.original)}
          onCheckedChange={() => selection.toggleItem(row.original)}
          aria-label={`Select ${getDogDisplayName(row.original)}`}
        />
      </span>
    ),
    enableSorting: false,
    enableHiding: false,
    meta: { interactive: true, exportDisabled: true } satisfies DataTableColumnMeta,
  };
}

function getStatusBadge(status: DogStatus | undefined) {
  switch (status) {
    case 'retired':
      return (
        <Badge variant="secondary" className="text-xs bg-warning/10 text-warning ">
          Retired
        </Badge>
      );
    case 'deceased':
      return (
        <Badge
          variant="secondary"
          className="text-xs bg-gray-100 text-gray-500 dark:bg-gray-800/30 dark:text-gray-400"
        >
          Deceased
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="text-xs bg-success/10 text-success ">
          Active
        </Badge>
      );
  }
}

function getSexBadge(sex: string | undefined) {
  if (!sex) return null;
  const label = sex.charAt(0).toUpperCase() + sex.slice(1);
  return (
    <Badge
      variant="secondary"
      className={`text-xs ${sex === 'male' ? 'bg-info/10 text-info ' : 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300'}`}
    >
      {label}
    </Badge>
  );
}

const columns: ColumnDef<Dog>[] = [
  {
    id: 'name',
    accessorFn: dog => getDogDisplayName(dog),
    header: 'Name',
    meta: { exportHeader: 'Name', exportValue: (dog: unknown) => getDogDisplayName(dog as Dog) },
    cell: ({ row }) => {
      const dog = row.original;
      return (
        <div className="flex items-center gap-2.5">
          {dog.imageUrl ? (
            <img
              src={dog.imageUrl}
              alt={dog.callName || dog.name}
              className="w-8 h-8 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold flex-shrink-0">
              {(getDogDisplayName(dog) || '?').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-medium truncate">{getDogDisplayName(dog)}</div>
            {dog.callName && dog.name && dog.callName !== dog.name && (
              <div className="text-xs text-muted-foreground truncate">{dog.name}</div>
            )}
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: 'breed',
    header: 'Breed',
    meta: { exportHeader: 'Breed', exportValue: (dog: unknown) => (dog as Dog).breed || '' },
    cell: ({ row }) => (
      <span className="text-muted-foreground truncate">{getDogBreedLabel(row.original)}</span>
    ),
  },
  {
    accessorKey: 'sex',
    header: 'Sex',
    meta: { exportHeader: 'Sex', exportValue: (dog: unknown) => (dog as Dog).sex || '' },
    cell: ({ row }) => getSexBadge(row.original.sex),
  },
  {
    id: 'owner',
    accessorFn: dog => dog.ownerName || '',
    header: 'Owner',
    meta: { exportHeader: 'Owner', exportValue: (dog: unknown) => (dog as Dog).ownerName || '' },
    cell: ({ row }) => (
      <span className="text-muted-foreground truncate">{row.original.ownerName || '—'}</span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    meta: {
      exportHeader: 'Status',
      exportValue: (dog: unknown) => (dog as Dog).status || 'active',
    },
    cell: ({ row }) => getStatusBadge(row.original.status),
  },
];

export const DogsTableView: React.FC<DogsTableViewProps> = ({ dogs, selection }) => {
  const navigate = useNavigate();

  const allColumns = useMemo(
    () => (selection ? [buildSelectColumn(selection), ...columns] : columns),
    [selection]
  );

  return (
    <DataTable
      tableId="dogsBrowse"
      columns={allColumns}
      data={dogs}
      // Page-level ListControls owns search; table keeps only its Columns control.
      showSearch={false}
      onRowClick={dog => navigate(`/dogs/${dog.id}`)}
      getRowId={dog => dog.id}
    />
  );
};

export default DogsTableView;
