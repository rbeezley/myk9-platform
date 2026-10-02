import type { ReactNode } from 'react';
import { StatusBadge } from '@/components/status';
import { shouldShowSection } from '@/components/classes/ClassDetailsMain.helpers';
import { compareLevels } from '@/utils/schedule-summary';
import type { ColumnDef } from '@/components/ui/data-table';
import type { ClassInfo } from './classInfo';

export interface ClassTableRow extends ClassInfo {
  trialLabel: string;
}

interface ClassColumnOptions {
  canManage: boolean;
  hideRing: boolean;
  /** The header checkbox that selects every visible class. */
  selectAll: () => ReactNode;
  select: (cls: ClassInfo) => ReactNode;
  judge: (cls: ClassInfo) => ReactNode;
  rowMenu: (cls: ClassInfo) => ReactNode;
}

/**
 * The Classes table's columns. Managers also get the select checkbox, the judge picker, the run
 * order under the element, and the row menu; everyone else reads the same table without them.
 */
export function buildClassesTabColumns({
  canManage,
  hideRing,
  selectAll,
  select,
  judge,
  rowMenu,
}: ClassColumnOptions): ColumnDef<ClassTableRow, unknown>[] {
  const cols: ColumnDef<ClassTableRow, unknown>[] = [];
  if (canManage) {
    cols.push({
      id: 'select',
      header: selectAll,
      enableSorting: false,
      enableHiding: false,
      meta: { interactive: true, exportDisabled: true },
      cell: ({ row }) => select(row.original),
    });
  }
  cols.push(
    {
      accessorKey: 'trialLabel',
      header: 'Trial',
      meta: { responsiveHide: 'md' as const },
    },
    {
      accessorKey: 'element',
      header: 'Element',
      cell: ({ row }) => (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span>{row.original.element}</span>
          {row.original.userHasEntry && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              My entry
            </span>
          )}
          {canManage && row.original.classOrder != null && (
            <span className="text-xs text-muted-foreground">Order: {row.original.classOrder}</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'level',
      header: 'Level',
      sortingFn: (rowA, rowB) => compareLevels(rowA.original.level, rowB.original.level),
      cell: ({ row }) => (
        <>
          {row.original.level}
          {shouldShowSection(row.original) && (
            <span className="ml-1 text-muted-foreground">{row.original.section}</span>
          )}
        </>
      ),
    },
    {
      accessorKey: 'judgeName',
      header: 'Judge',
      meta: { responsiveHide: 'md' as const, interactive: canManage },
      cell: ({ row }) =>
        canManage ? (
          judge(row.original)
        ) : (
          <span className="text-muted-foreground">{row.original.judgeName || 'TBD'}</span>
        ),
    },
    {
      accessorKey: 'time',
      header: 'Time',
      meta: { responsiveHide: 'sm' as const },
    }
  );

  if (!hideRing) {
    cols.push({
      accessorKey: 'ring',
      header: 'Ring',
      meta: { responsiveHide: 'sm' as const },
    });
  }

  cols.push(
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <StatusBadge
          family="class"
          status={row.original.status}
          className="px-2 py-0.5 rounded text-xs font-medium"
          variant="outline"
        />
      ),
    },
    {
      accessorKey: 'entryCount',
      header: 'Entries',
      cell: ({ row }) => row.original.entryCount ?? '—',
    }
  );

  if (canManage) {
    cols.push({
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      enableHiding: false,
      meta: { interactive: true, exportDisabled: true },
      cell: ({ row }) => rowMenu(row.original),
    });
  }

  return cols;
}
