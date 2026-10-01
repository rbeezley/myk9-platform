import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState } from '@/components/common/EmptyState';
import { useViewPreference, CARD_TABLE_MODES } from '@/hooks/useViewPreference';
import { ViewToggle } from '@/components/common/ViewToggle';
import { ClassCard } from './ClassCard';
import { Button } from '@/components/ui/button';
import { Search, Plus } from 'lucide-react';
import { formatTrialLabel, type ClassStatusValue } from '@myk9/core';
import { formatEntryDate } from '@/lib/format/dates';
import { compareLevels } from '@/utils/schedule-summary';
import { shouldShowSection } from '@/components/classes/ClassDetailsMain.helpers';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/status';
import { ListViewTabs } from '@/components/list-toolkit';
import { useShowManageScope } from '@/hooks/useShowManageScope';
import { SetupRowActionsMenu } from './SetupRowActionsMenu';
import { SetupClassDialogs, type SetupClassAction } from './SetupClassDialogs';
import { getAddClassesHref } from '@/pages/secretary/ShowCreationWizard/addClassesHref';
import {
  activeClassesTabViewId,
  buildClassesTabViews,
  classesTabViewFilters,
  filterClassesForTab,
} from './classesTabViews';

export interface ClassInfo {
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
  entryCount: number | null;
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
  // Long weekday style ("Saturday, August 1, 2026") via the shared date module
  // (UX walk remediation 2.A); falls back to the raw string if unparseable.
  return formatEntryDate(dateStr, { style: 'long' }) || dateStr;
}

/** The class's trial label (MYK9-704), or '' when the class carries no trial at all. */
function classTrialPart(cls: ClassInfo): string {
  if (!cls.trialName && !cls.trialNumber) return '';
  return formatTrialLabel({ name: cls.trialName, trialNumber: cls.trialNumber });
}

export function ClassesTab({ classes, showId, userHasEntries, hideRing = false }: ClassesTabProps) {
  const navigate = useNavigate();
  const [storedViewMode, setViewModePreference, hasStoredViewPreference] = useViewPreference(
    'classes',
    userHasEntries ? 'cards' : 'table'
  );
  const [viewModeTouched, setViewModeTouched] = useState(false);
  // Always starts on the whole show (Oct 10 rehearsal: a secretary who also
  // holds entries in the show must land on "All", never auto-scoped to
  // "Mine" — that scoping is now one pressable view among four, not a
  // silent default). See `classesTabViews.ts`.
  const [viewId, setViewId] = useState('all');
  // ONE predicate for every manage affordance here (Add, row Edit / Delete): THIS show's owning
  // club, the scope the show shell's Edit show button uses. The global permission is not
  // club-scoped, and this tab also renders on the public show page. Resolving / unavailable
  // read as no.
  const canManageThisShow = useShowManageScope(showId).canManage;
  // Row Edit / Delete (MYK9-900): the existing class panel and dialog, opened in place.
  const [pendingAction, setPendingAction] = useState<SetupClassAction | null>(null);
  const viewMode =
    userHasEntries && !hasStoredViewPreference && !viewModeTouched ? 'cards' : storedViewMode;

  const setViewMode = (mode: string) => {
    setViewModeTouched(true);
    setViewModePreference(mode);
  };

  const viewFilters = classesTabViewFilters(viewId);
  const views = useMemo(() => buildClassesTabViews(classes), [classes]);
  const activeViewId = activeClassesTabViewId(viewFilters);
  const filteredClasses = useMemo(
    () => filterClassesForTab(classes, viewFilters),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- viewFilters is derived from viewId
    [classes, viewId]
  );

  // Group classes by trial (date + number)
  const groupedByTrial = useMemo(() => {
    const groups = new Map<string, { label: string; classes: ClassInfo[] }>();
    for (const cls of filteredClasses) {
      const key = `${cls.trialDate || ''}|${cls.trialNumber || ''}`;
      if (!groups.has(key)) {
        const datePart = cls.trialDate ? formatTrialDate(cls.trialDate) : '';
        const trialPart = classTrialPart(cls);
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
        trialLabel: [cls.trialDate ? formatTrialDate(cls.trialDate) : '', classTrialPart(cls)]
          .filter(Boolean)
          .join(' \u2014 '),
      })),
    [filteredClasses]
  );

  const classRowMenu = (cls: ClassInfo) => (
    <SetupRowActionsMenu
      subject="Class"
      rowLabel={[cls.element, cls.level, cls.section].filter(Boolean).join(' ')}
      onEdit={() => setPendingAction({ classId: cls.id, action: 'edit' })}
      onDelete={() => setPendingAction({ classId: cls.id, action: 'delete' })}
    />
  );

  const classColumns = useMemo<ColumnDef<ClassTableRow, unknown>[]>(() => {
    const cols: ColumnDef<ClassTableRow, unknown>[] = [
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
          return (
            <StatusBadge
              family="class"
              status={row.original.status}
              className="px-2 py-0.5 rounded text-xs font-medium"
              variant="outline"
            />
          );
        },
      },
      {
        accessorKey: 'entryCount',
        header: 'Entries',
        cell: ({ row }) => row.original.entryCount ?? '—',
      }
    );

    if (canManageThisShow) {
      cols.push({
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        enableHiding: false,
        meta: { interactive: true, exportDisabled: true },
        cell: ({ row }) => classRowMenu(row.original),
      });
    }

    return cols;
  }, [hideRing, canManageThisShow]);

  if (classes.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title="No classes scheduled"
        description="Classes for this show haven't been set up yet."
        action={
          canManageThisShow
            ? {
                label: 'Add Classes',
                onClick: () => navigate(getAddClassesHref(showId)),
                icon: Plus,
              }
            : null
        }
      />
    );
  }

  // "Mine" is hidden when the signed-in user holds no entries in the show —
  // it would only ever read "Mine (0)" (MineToggle's `hidden` prop, before it).
  const visibleViews = userHasEntries ? views : views.filter(view => view.id !== 'mine');

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ListViewTabs
          label="Class views"
          views={visibleViews}
          activeId={activeViewId}
          onSelect={setViewId}
        />
        <div className="flex items-center gap-2 sm:ml-auto">
          <ViewToggle modes={CARD_TABLE_MODES} active={viewMode} onChange={setViewMode} />
          {canManageThisShow && (
            <Button
              size="sm"
              onClick={() => navigate(getAddClassesHref(showId))}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Add Classes
            </Button>
          )}
        </div>
      </div>

      {filteredClasses.length === 0 && classes.length > 0 ? (
        <EmptyState
          icon={Search}
          variant="filter"
          size="sm"
          title={
            viewFilters.mine
              ? 'None of your entered classes match.'
              : viewFilters.status === 'pending'
                ? 'All classes completed!'
                : viewFilters.status === 'completed'
                  ? 'No classes completed yet.'
                  : 'No classes match the current filter.'
          }
          action={{ label: 'Show all classes', onClick: () => setViewId('all') }}
        />
      ) : viewMode === 'table' ? (
        <DataTable
          tableId="classesTab"
          columns={classColumns}
          data={tableData}
          getRowClassName={cls => (cls.userHasEntry ? 'bg-primary/5' : '')}
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
                  {...(canManageThisShow ? { actions: classRowMenu(cls) } : {})}
                  onClick={() =>
                    navigate(`/shows/${showId}/trials/${cls.trialId}/classes/${cls.id}`)
                  }
                />
              ))}
            </div>
          </div>
        ))
      )}
      {canManageThisShow && pendingAction && (
        <SetupClassDialogs
          showId={showId}
          pending={pendingAction}
          onClose={() => setPendingAction(null)}
        />
      )}
    </div>
  );
}
