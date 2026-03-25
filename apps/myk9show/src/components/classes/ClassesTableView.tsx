import React from 'react';
import { useNavigate } from 'react-router-dom';
import { getClassStatusBadgeClasses } from '@myk9/core';
import { type ColumnDef, type SortingFn } from '@tanstack/react-table';
import { DataTable, levelProgressionSort } from '@/components/ui/data-table';
import type { TrialClass } from '@/components/trials/types/trial.types';
import { shouldShowSection } from './ClassDetailsMain.helpers';

interface ClassesTableViewProps {
  classes: TrialClass[];
}

const COLUMNS: ColumnDef<TrialClass, unknown>[] = [
  {
    accessorKey: 'element',
    header: 'Class',
    accessorFn: cls => cls.element ?? '',
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="font-medium truncate">{row.original.element}</div>
        {shouldShowSection(row.original) && (
          <div className="text-xs text-muted-foreground truncate">
            Section {row.original.section}
          </div>
        )}
      </div>
    ),
  },
  {
    accessorKey: 'level',
    header: 'Level',
    accessorFn: cls => cls.level ?? '',
    sortingFn: levelProgressionSort as SortingFn<TrialClass>,
    cell: ({ row }) => (
      <span className="text-muted-foreground truncate">{row.original.level || '\u2014'}</span>
    ),
  },
  {
    id: 'judgeName',
    header: 'Judge',
    accessorFn: cls => (cls.judgeName ?? 'TBD').toLowerCase(),
    cell: ({ row }) => (
      <span className="text-muted-foreground truncate">{row.original.judgeName || 'TBD'}</span>
    ),
  },
  {
    accessorKey: 'entries',
    header: 'Entries',
    sortingFn: 'basic',
    cell: ({ row }) => (
      <div className="flex items-center gap-1">
        <span>{row.original.completedEntries ?? 0}</span>
        <span className="text-muted-foreground">/</span>
        <span>{row.original.entries}</span>
      </div>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    accessorFn: cls => (cls.status ?? '').toLowerCase(),
    cell: ({ row }) => (
      <span
        className={`inline-block px-3 py-1 text-xs font-semibold rounded-full ${getClassStatusBadgeClasses(row.original.status)}`}
      >
        {row.original.status}
      </span>
    ),
  },
];

export const ClassesTableView: React.FC<ClassesTableViewProps> = ({ classes }) => {
  const navigate = useNavigate();

  return (
    <DataTable<TrialClass>
      data={classes}
      columns={COLUMNS}
      getRowId={cls => cls.id}
      onRowClick={cls => navigate(`/classes/${cls.id}`)}
    />
  );
};

export default ClassesTableView;
