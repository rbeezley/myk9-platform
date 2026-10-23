import { StatusBadge, getStatusDescriptor } from '@/components/status';
import { shouldShowSection } from '@/components/classes/ClassDetailsMain.helpers';
import { parseTime } from '@/features/show-map/cockpit/cockpitClock';
import { buildFullClassLabel } from '@/features/_shared/classLabel';
import { compareLevels } from '@/utils/schedule-summary';
import type { ColumnDef } from '@/components/ui/data-table';
import type { ClassInfo } from './classInfo';

/** "Novice A": the level and, when the class has one, its section. */
function levelLabel(cls: ClassTableRow): string {
  return buildFullClassLabel(
    { level: cls.level, section: shouldShowSection(cls) ? cls.section : '' },
    '',
    cls.level
  );
}

/**
 * Clock-time order for the Time column: two unscheduled classes compare equal, and an
 * unscheduled class sorts after a scheduled one (`Infinity - Infinity` would be NaN).
 */
export function compareClockTimes(a: string | null | undefined, b: string | null | undefined) {
  const ma = parseTime(a);
  const mb = parseTime(b);
  if (ma === null && mb === null) return 0;
  if (ma === null) return 1;
  if (mb === null) return -1;
  return ma - mb;
}

export interface ClassTableRow extends ClassInfo {
  trialLabel: string;
}

interface ClassColumnOptions {
  hideRing: boolean;
}

/**
 * The public / exhibitor Classes table's columns. Managing classes is the show home's schedule
 * (Select classes, MYK9-1324), so this table only reads.
 */
export function buildClassesTabColumns({
  hideRing,
}: ClassColumnOptions): ColumnDef<ClassTableRow, unknown>[] {
  const cols: ColumnDef<ClassTableRow, unknown>[] = [];
  cols.push(
    {
      accessorKey: 'trialLabel',
      header: 'Trial',
      meta: { responsiveHide: 'md' as const },
    },
    {
      accessorKey: 'element',
      header: 'Element',
      // The "My entry" badge is shown beside the element, so it is part of what the column shows.
      meta: {
        searchValue: (row: unknown) => {
          const cls = row as ClassTableRow;
          return cls.userHasEntry ? `${cls.element} My entry` : cls.element;
        },
      },
      cell: ({ row }) => (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span>{row.original.element}</span>
          {row.original.userHasEntry && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              My entry
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'level',
      header: 'Level',
      // Shown as "Novice A": the level and its section.
      meta: {
        searchValue: (row: unknown) => {
          return levelLabel(row as ClassTableRow);
        },
      },
      sortingFn: (rowA, rowB) => compareLevels(rowA.original.level, rowB.original.level),
      // One text node, so the label reads "Novice A" to search, copy and screen readers.
      cell: ({ row }) => levelLabel(row.original),
    },
    {
      accessorKey: 'judgeName',
      header: 'Judge',
      meta: {
        responsiveHide: 'md' as const,
        // An unassigned class shows "TBD".
        searchValue: (row: unknown) => (row as ClassTableRow).judgeName || 'TBD',
      },
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.judgeName || 'TBD'}</span>
      ),
    },
    {
      accessorKey: 'time',
      header: 'Time',
      // "9:00 AM" sorts after "10:00 AM" as text; sort by clock time, unscheduled last.
      sortingFn: (rowA, rowB) => compareClockTimes(rowA.original.time, rowB.original.time),
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
      // Shown as "Not started" for a stored "Scheduled".
      meta: {
        searchValue: (row: unknown) =>
          getStatusDescriptor('class', (row as ClassTableRow).status).label,
      },
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

  return cols;
}
