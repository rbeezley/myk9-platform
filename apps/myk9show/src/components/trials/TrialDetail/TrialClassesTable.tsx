import { useState, useMemo, startTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrialClass } from '../types/trial.types';
import { type ColumnDef, type SortingFn } from '@tanstack/react-table';
import { DataTable, filterByListSearch } from '@/components/ui/data-table';
import { Layers } from 'lucide-react';
import {
  ListEmptyState,
  ListFilterBar,
  ListResultLine,
  ListViewToggle,
} from '@/components/list-toolkit';
import { useViewPreference } from '@/hooks/useViewPreference';
import { defaultListView } from '@/utils/defaultListView';
import { getClassDetailHref } from '@/utils/classDetailHref';
import { TrialClassesCards } from './TrialClassesCards';
import { StatusBadge, getStatusDescriptor } from '@/components/status';
import { NotSet } from '@/components/common/NotSet';
import { shouldShowLevel, shouldShowSection } from '@/components/classes/ClassDetailsMain.helpers';
import { compareLevels } from '@/utils/schedule-summary';

const CLASS_NOUN = ['class', 'classes'] as const;

function formatStartTime(startTime: string | undefined): string {
  return startTime
    ? new Date(String(startTime)).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    : 'Not set';
}

// The canonical progression (`compareLevels`, `@/utils/schedule-summary`) is
// the same one the show wizard and `ClassesTab` use — an ad-hoc table here
// previously had its own, disagreeing vocabulary (no Open/Utility, and A/B
// treated as separate progression steps rather than sections of one level;
// MYK9-811 rehearsal note).
const trialLevelSort: SortingFn<TrialClass> = (rowA, rowB) =>
  compareLevels(rowA.original.level, rowB.original.level);

interface TrialClassesTableProps {
  classes: TrialClass[];
  /** The show the trial belongs to; every class row opens the one class-detail URL under it. */
  showId: string;
  trialId?: string;
}

export const TrialClassesTable = ({ classes, showId, trialId }: TrialClassesTableProps) => {
  const navigate = useNavigate();
  // Staff open on the table, a visitor on cards; her own choice is remembered (decision 8).
  const [viewMode, setViewMode] = useViewPreference('trial-classes', defaultListView(false));
  const [search, setSearch] = useState('');
  const searchText = search.trim();
  const openClass = (classId: string) =>
    startTransition(() => navigate(getClassDetailHref(showId, trialId ?? '', classId)));

  const columns: ColumnDef<TrialClass, unknown>[] = useMemo(
    () => [
      {
        accessorKey: 'element',
        header: 'Element',
      },
      {
        id: 'level',
        header: 'Level',
        accessorFn: cls => {
          if (shouldShowLevel(cls)) {
            return cls.level + (shouldShowSection(cls) ? ` ${cls.section}` : '');
          }
          return '';
        },
        sortingFn: trialLevelSort,
        cell: ({ row }) => (
          <>
            {shouldShowLevel(row.original) ? row.original.level : '—'}
            {shouldShowSection(row.original) && ` ${row.original.section}`}
          </>
        ),
      },
      {
        id: 'judgeName',
        header: 'Judge',
        accessorFn: cls => cls.judgeName || '',
        cell: ({ row }) => row.original.judgeName || <NotSet />,
      },
      {
        accessorKey: 'startTime',
        header: 'Start Time',
        sortingFn: 'datetime',
        // Shown as "9:00 AM" (or "Not set"), so that is findable as well as the stored timestamp.
        meta: { searchValue: (row: unknown) => formatStartTime((row as TrialClass).startTime) },
        cell: ({ row }) =>
          row.original.startTime ? formatStartTime(row.original.startTime) : <NotSet />,
      },
      {
        accessorKey: 'entries',
        header: 'Entries',
        sortingFn: 'basic',
        cell: ({ row }) => {
          const cls = row.original;
          return (
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <span>{cls.completedEntries ?? 0}</span>
                <span className="text-muted-foreground">/</span>
                <span>{cls.entries}</span>
              </div>
              {cls.entries > 0 && (
                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, ((cls.completedEntries ?? 0) / cls.entries) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        // Shown as "Not started" for a stored "Scheduled".
        meta: {
          searchValue: (row: unknown) =>
            getStatusDescriptor('class', (row as TrialClass).status).label,
        },
        cell: ({ row }) => (
          <StatusBadge
            family="class"
            status={row.original.status}
            className="px-3 py-1 text-xs"
            variant="outline"
          />
        ),
      },
    ],
    []
  );

  // The one search, read from the columns the table renders (so it finds what the table shows).
  const visibleClasses = useMemo(
    () => filterByListSearch(classes, columns, searchText),
    [classes, columns, searchText]
  );

  if (classes.length === 0) {
    return (
      <ListEmptyState
        icon={Layers}
        noun={CLASS_NOUN}
        filtered={false}
        onShowAll={() => setSearch('')}
        description="Classes for this trial have not been published yet"
        action={null}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <ListFilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search classes..."
          fields={[]}
        />
        <ListResultLine
          shown={visibleClasses.length}
          total={classes.length}
          noun={CLASS_NOUN}
          filtered={searchText !== ''}
          onShowAll={() => setSearch('')}
          showAllInEmptyState={visibleClasses.length === 0}
        >
          <ListViewToggle active={viewMode} onChange={setViewMode} />
        </ListResultLine>
      </div>

      {visibleClasses.length === 0 ? (
        <ListEmptyState
          icon={Layers}
          noun={CLASS_NOUN}
          filtered
          onShowAll={() => setSearch('')}
          action={null}
        />
      ) : viewMode === 'cards' ? (
        <TrialClassesCards classes={visibleClasses} showId={showId} trialId={trialId || ''} />
      ) : (
        <DataTable<TrialClass>
          tableId="trialClasses"
          columns={columns}
          data={visibleClasses}
          getRowId={cls => cls.id}
          onRowClick={cls => openClass(cls.id)}
          noResultsMessage="No classes found"
        />
      )}
    </div>
  );
};
