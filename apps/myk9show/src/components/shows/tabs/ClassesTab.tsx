import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MineToggle } from '@/components/common/MineToggle';
import { EmptyState } from '@/components/common/EmptyState';
import { useViewPreference, CARD_TABLE_MODES } from '@/hooks/useViewPreference';
import { ViewToggle } from '@/components/common/ViewToggle';
import { ClassCard } from './ClassCard';
import { Button } from '@/components/ui/button';
import { Search, Plus } from 'lucide-react';
import { useRBAC } from '@/hooks/useRBAC';
import { cn } from '@/lib/utils';
import {
  getClassStatusDisplay,
  getClassStatusBadgeClasses,
  getClassDisplayStatus,
  type ClassStatusValue,
  type ClassDisplayStatus,
} from '@myk9/core';
import { StatusFilter, type StatusFilterValue } from '@/components/common/StatusFilter';
import { FilterEmptyState } from '@/components/common/FilterEmptyState';
import { parseLocalDateString } from '@/utils/dateLocal';
import { compareLevels } from '@/utils/schedule-summary';
import { shouldShowSection } from '@/components/classes/ClassDetailsMain.helpers';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';

interface ClassInfo {
  id: string;
  name: string;
  element: string;
  level: string;
  section: string;
  judgeName: string;
  trialId: string;
  time: string;
  ring: number;
  status: ClassStatusValue;
  entryCount: number;
  scoredCount?: number;
  isScoringFinalized?: boolean;
  hasActiveEntries?: boolean;
  userHasEntry: boolean;
  trialDate?: string;
  trialNumber?: string;
  trialName?: string;
}

interface ClassesTabProps {
  classes: ClassInfo[];
  showId: string;
  userHasEntries: boolean;
  hideRing?: boolean;
}

interface ClassTableRow extends ClassInfo {
  trialLabel: string;
}

function formatTrialDate(dateStr: string): string {
  const date = parseLocalDateString(dateStr);
  if (!date) return dateStr;
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function ClassesTab({ classes, showId, userHasEntries, hideRing = false }: ClassesTabProps) {
  const navigate = useNavigate();
  const { hasPermission } = useRBAC();
  const [viewMode, setViewMode] = useViewPreference('classes', 'table');
  const [isMine, setIsMine] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all');
  const canManage = hasPermission('admin:manage') || hasPermission('show:manage');

  const mineCount = useMemo(() => classes.filter(c => c.userHasEntry).length, [classes]);
  const mineFilteredClasses = useMemo(
    () => (isMine ? classes.filter(c => c.userHasEntry) : classes),
    [classes, isMine]
  );

  const classDisplayStatuses = useMemo(() => {
    const map = new Map<string, ClassDisplayStatus>();
    for (const cls of mineFilteredClasses) {
      const input: Parameters<typeof getClassDisplayStatus>[0] = {
        status: cls.status,
        entry_count: cls.entryCount,
        scored_count: cls.scoredCount ?? 0,
      };
      if (cls.isScoringFinalized !== undefined) input.is_scoring_finalized = cls.isScoringFinalized;
      if (cls.hasActiveEntries !== undefined) input.has_active_entries = cls.hasActiveEntries;
      map.set(cls.id, getClassDisplayStatus(input));
    }
    return map;
  }, [mineFilteredClasses]);

  const statusCounts = useMemo(() => {
    let pending = 0;
    let completed = 0;
    for (const ds of classDisplayStatuses.values()) {
      if (ds === 'completed') completed++;
      else pending++;
    }
    return { all: mineFilteredClasses.length, pending, completed };
  }, [mineFilteredClasses, classDisplayStatuses]);

  const filteredClasses = useMemo(() => {
    if (statusFilter === 'all') return mineFilteredClasses;
    return mineFilteredClasses.filter(cls => {
      const ds = classDisplayStatuses.get(cls.id) ?? 'not-started';
      if (statusFilter === 'completed') return ds === 'completed';
      return ds !== 'completed'; // pending = not-started + in-progress
    });
  }, [mineFilteredClasses, statusFilter, classDisplayStatuses]);

  // Group classes by trial (date + number)
  const groupedByTrial = useMemo(() => {
    const groups = new Map<string, { label: string; classes: ClassInfo[] }>();
    for (const cls of filteredClasses) {
      const key = `${cls.trialDate || ''}|${cls.trialNumber || ''}`;
      if (!groups.has(key)) {
        const datePart = cls.trialDate ? formatTrialDate(cls.trialDate) : '';
        const trialPart = cls.trialName || (cls.trialNumber ? `Trial ${cls.trialNumber}` : '');
        const label = [datePart, trialPart].filter(Boolean).join(' — ');
        groups.set(key, { label: label || 'Unassigned', classes: [] });
      }
      groups.get(key)!.classes.push(cls);
    }
    // Sort classes within each group by element, then level progression
    for (const group of groups.values()) {
      group.classes.sort((a, b) => {
        const elemCmp = a.element.localeCompare(b.element);
        if (elemCmp !== 0) return elemCmp;
        return compareLevels(a.level, b.level);
      });
    }
    return Array.from(groups.values());
  }, [filteredClasses]);

  const hasMultipleTrials = groupedByTrial.length > 1;

  // Flat table data with trial label for the DataTable view
  const tableData = useMemo<ClassTableRow[]>(
    () =>
      filteredClasses.map(cls => ({
        ...cls,
        trialLabel: [
          cls.trialDate ? formatTrialDate(cls.trialDate) : '',
          cls.trialName || (cls.trialNumber ? `Trial ${cls.trialNumber}` : ''),
        ]
          .filter(Boolean)
          .join(' \u2014 '),
      })),
    [filteredClasses]
  );

  const classColumns = useMemo<ColumnDef<ClassTableRow, unknown>[]>(() => {
    const cols: ColumnDef<ClassTableRow, unknown>[] = [
      {
        accessorKey: 'trialLabel',
        header: 'Trial',
        meta: { responsiveHide: 'md' as const },
      },
      { accessorKey: 'element', header: 'Element' },
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
        meta: { responsiveHide: 'md' as const },
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.judgeName || 'TBD'}</span>
        ),
      },
      {
        accessorKey: 'time',
        header: 'Time',
        meta: { responsiveHide: 'sm' as const },
      },
    ];

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
        cell: ({ row }) => {
          const statusDisplay = getClassStatusDisplay(row.original.status);
          return (
            <span
              className={cn(
                'px-2 py-0.5 rounded text-xs font-medium',
                getClassStatusBadgeClasses(row.original.status)
              )}
            >
              {statusDisplay.label}
            </span>
          );
        },
      },
      {
        accessorKey: 'entryCount',
        header: 'Entries',
      }
    );

    return cols;
  }, [hideRing]);

  if (classes.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title="No classes scheduled"
        description="Classes for this show haven't been set up yet."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <StatusFilter
            filter={statusFilter}
            onFilterChange={setStatusFilter}
            counts={statusCounts}
          />
          <MineToggle
            isMine={isMine}
            onToggle={() => setIsMine(!isMine)}
            allLabel="All Classes"
            mineLabel="My Classes"
            allCount={classes.length}
            mineCount={mineCount}
            hidden={!userHasEntries}
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ViewToggle modes={CARD_TABLE_MODES} active={viewMode} onChange={setViewMode} />
          {canManage && (
            <Button
              size="sm"
              onClick={() =>
                navigate(`/secretary/create-show/wizard?showId=${showId}&mode=add-classes`)
              }
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              New Class
            </Button>
          )}
        </div>
      </div>

      {filteredClasses.length === 0 && classes.length > 0 ? (
        <FilterEmptyState
          noun="classes"
          statusFilter={statusFilter}
          onReset={() => setStatusFilter('all')}
        />
      ) : viewMode === 'table' ? (
        <DataTable
          tableId="classesTab"
          columns={classColumns}
          data={tableData}
          initialSorting={[
            { id: 'trialLabel', desc: false },
            { id: 'element', desc: false },
            { id: 'level', desc: false },
          ]}
          onRowClick={cls => navigate(`/shows/${showId}/trials/${cls.trialId}/classes/${cls.id}`)}
        />
      ) : (
        groupedByTrial.map(group => (
          <div key={group.label} className="space-y-3">
            {hasMultipleTrials && (
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
                {group.label}
              </h3>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {group.classes.map(cls => (
                <ClassCard
                  key={cls.id}
                  classInfo={cls}
                  hideRing={hideRing}
                  onClick={() =>
                    navigate(`/shows/${showId}/trials/${cls.trialId}/classes/${cls.id}`)
                  }
                />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
