import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Calendar, Plus } from 'lucide-react';
import { useViewPreference } from '@/hooks/useViewPreference';
import { defaultListView } from '@/utils/defaultListView';
import { useTrialRowActions } from './useTrialRowActions';
import {
  GuestExportButton,
  ListEmptyState,
  ListFilterBar,
  ListResultLine,
  ListViewTabs,
  ListViewToggle,
} from '@/components/list-toolkit';
import type { Trial } from '@/components/trials/types/trial.types';
import { deriveTrialStatusKey, formatTrialLabel, type ClassStatusValue } from '@myk9/core';
import { parseLocalDateString } from '@/utils/dateLocal';
import { DataTable, filterByListSearch, type ColumnDef } from '@/components/ui/data-table';
import { formatTrialTypeLabel } from '@/types/template.types';
import { StatusBadge, getStatusDescriptor } from '@/components/status';
import { usePageExportAction } from '@/features/actions/pageEditTarget';
import { getAddTrialsHref } from '@/pages/secretary/ShowCreationWizard/addTrialsHref';
import { exportRowsCsv } from '@/utils/downloadCsv';
import { useShowManageScope } from '@/hooks/useShowManageScope';
import {
  activeTrialsTabViewId,
  buildTrialsTabViews,
  filterTrialsForTab,
  trialsTabViewFilters,
  type TrialsTabStatus,
} from './trialsTabViews';

export interface TrialStats {
  classCount: number;
  entryCount: number | null;
  completedClasses: number;
  hasStarted?: boolean;
}

const TRIAL_NOUN = ['trial', 'trials'] as const;

interface TrialsTabProps {
  trials: Trial[];
  showId: string;
  trialStats: Record<string, TrialStats>;
}

function getDateParts(dateStr: string): { month: string; day: string } | null {
  const date = parseLocalDateString(dateStr);
  if (!date) return null;
  return {
    month: date.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(),
    day: String(date.getDate()),
  };
}

const EMPTY_STATS: TrialStats = {
  classCount: 0,
  entryCount: 0,
  completedClasses: 0,
  hasStarted: false,
};

interface TrialRow {
  id: string;
  trialDate: string;
  name: string;
  trialNumber: string;
  trialType: string | undefined;
  trialTypeLabel: string | undefined;
  plannedStartTime: string | undefined;
  status: ClassStatusValue;
  classCount: number;
  entryCount: number | null;
  completedClasses: number;
  hasStarted?: boolean;
}

/** The status the row's badge shows ("Not started", "In progress"), derived from its classes. */
function trialStatusLabel(row: TrialRow): string {
  return getStatusDescriptor(
    'trial',
    deriveTrialStatusKey({
      trialStatus: row.status,
      classCount: row.classCount,
      completedCount: row.completedClasses,
      hasStarted: row.hasStarted,
    })
  ).label;
}

const baseTrialColumns: ColumnDef<TrialRow, unknown>[] = [
  {
    accessorKey: 'trialDate',
    header: 'Date',
    // Shown as "MAY 10", so that is findable as well as the stored date.
    meta: {
      searchValue: (row: unknown) => {
        const parts = getDateParts((row as TrialRow).trialDate);
        return parts ? `${parts.month} ${parts.day}` : '';
      },
    },
    cell: ({ row }) => {
      const parts = getDateParts(row.original.trialDate);
      return parts ? `${parts.month} ${parts.day}` : '\u2014';
    },
  },
  { accessorKey: 'name', header: 'Trial Name' },
  { accessorKey: 'trialTypeLabel', header: 'Type', meta: { responsiveHide: 'md' as const } },
  { accessorKey: 'plannedStartTime', header: 'Time', meta: { responsiveHide: 'md' as const } },
  { accessorKey: 'classCount', header: 'Classes' },
  {
    accessorKey: 'entryCount',
    header: 'Entries',
    cell: ({ row }) => row.original.entryCount ?? '—',
  },
  {
    accessorKey: 'completedClasses',
    header: 'Scored',
    meta: { responsiveHide: 'sm' as const },
    cell: ({ row }) => {
      const { completedClasses, classCount } = row.original;
      return completedClasses > 0 ? `${completedClasses}/${classCount}` : '\u2014';
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    meta: { searchValue: (row: unknown) => trialStatusLabel(row as TrialRow) },
    cell: ({ row }) => (
      <StatusBadge
        family="trial"
        status={deriveTrialStatusKey({
          trialStatus: row.original.status,
          classCount: row.original.classCount,
          completedCount: row.original.completedClasses,
          hasStarted: row.original.hasStarted,
        })}
        className="text-xs"
        variant="outline"
      />
    ),
  },
];

export function TrialsTab({ trials, showId, trialStats }: TrialsTabProps) {
  const navigate = useNavigate();

  const [statusFilter, setStatusFilter] = useState<TrialsTabStatus>('all');
  const [search, setSearch] = useState('');
  // ONE predicate for every manage affordance here (Add, row Edit / Delete): THIS show's owning
  // club, the scope the show shell's Edit show button uses. The global permission is not
  // club-scoped, and this tab also renders on the public show page. Resolving / unavailable
  // read as no.
  const manageScope = useShowManageScope(showId);
  const canManageThisShow = manageScope.canManage;
  // Staff open on the table, a visitor on cards; her own choice is remembered (decision 8). The
  // default is held until the role is known, so a manager never sees cards flash first; a view
  // she already chose shows at once.
  const [viewMode, setViewMode, hasStoredView] = useViewPreference(
    'trials',
    defaultListView(canManageThisShow)
  );
  const viewReady = manageScope.status !== 'resolving' || hasStoredView;
  // Row Edit / Delete (MYK9-900): shared with the show home's trial headings (MYK9-956).
  const { trialRowMenu, trialDialogs } = useTrialRowActions(showId, canManageThisShow);
  const trialColumns = useMemo<ColumnDef<TrialRow, unknown>[]>(
    () =>
      canManageThisShow
        ? [
            ...baseTrialColumns,
            {
              id: 'actions',
              header: () => <span className="sr-only">Actions</span>,
              enableSorting: false,
              enableHiding: false,
              meta: { interactive: true },
              cell: ({ row }) => trialRowMenu(row.original.id, row.original.name),
            },
          ]
        : baseTrialColumns,
    // `trialRowMenu` is rebuilt whenever its busy / locked state changes, so the column follows it.
    [canManageThisShow, trialRowMenu]
  );

  const trialViews = useMemo(() => buildTrialsTabViews(trials, trialStats), [trials, trialStats]);

  const viewTrials = useMemo(
    () => filterTrialsForTab(trials, trialStats, statusFilter),
    [trials, trialStats, statusFilter]
  );
  const searchText = search.trim().toLowerCase();
  const narrowed = statusFilter !== 'all' || searchText !== '';
  const showAll = () => {
    setStatusFilter('all');
    setSearch('');
  };

  const viewRows = useMemo<TrialRow[]>(
    () =>
      viewTrials.map(trial => ({
        id: trial.id,
        trialDate: trial.trialDate,
        name: formatTrialLabel({ name: trial.name, trialNumber: trial.trialNumber }),
        trialNumber: trial.trialNumber,
        trialType: trial.trialType,
        trialTypeLabel: trial.trialType ? formatTrialTypeLabel(trial.trialType) : undefined,
        plannedStartTime: trial.plannedStartTime,
        status: trial.status,
        ...(trialStats[trial.id] || EMPTY_STATS),
      })),
    [viewTrials, trialStats]
  );
  // The one search, read from the columns the table renders (so it finds what the table shows).
  const tableData = useMemo(
    () => filterByListSearch(viewRows, trialColumns, search),
    [viewRows, trialColumns, search]
  );
  const filteredTrials = useMemo(() => {
    const shown = new Set(tableData.map(row => row.id));
    return viewTrials.filter(trial => shown.has(trial.id));
  }, [viewTrials, tableData]);

  // The whole-list export the table's own button used to be (owner decision 4: header Actions menu).
  const exportTrials = () =>
    exportRowsCsv(
      'trials',
      ['Date', 'Trial Name', 'Type', 'Time', 'Classes', 'Entries', 'Scored', 'Status'],
      tableData.map(row => [
        row.trialDate,
        row.name,
        row.trialTypeLabel ?? '',
        row.plannedStartTime ?? '',
        row.classCount,
        row.entryCount ?? '',
        row.completedClasses > 0 ? `${row.completedClasses}/${row.classCount}` : '',
        trialStatusLabel(row),
      ])
    );
  usePageExportAction({
    id: 'trials',
    enabled: viewReady && viewMode === 'table' && tableData.length > 0,
    run: exportTrials,
  });

  const openWizard = () => navigate(getAddTrialsHref(showId));

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {trialViews.length > 0 && (
          <ListViewTabs
            label="Trial views"
            views={trialViews}
            activeId={activeTrialsTabViewId(statusFilter)}
            onSelect={id => setStatusFilter(trialsTabViewFilters(id))}
          />
        )}
        {trials.length > 0 && (
          <>
            <ListFilterBar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search trials..."
              fields={[]}
            />
            <ListResultLine
              shown={filteredTrials.length}
              total={trials.length}
              noun={TRIAL_NOUN}
              filtered={narrowed}
              onShowAll={showAll}
              showAllInEmptyState={filteredTrials.length === 0}
            >
              {/* Signed-out visitors have no header Actions menu (MYK9-933); the public table
                  shows every column of this export. */}
              <GuestExportButton enabled={tableData.length > 0} onExport={exportTrials} />
              <ListViewToggle active={viewMode} onChange={setViewMode} />
            </ListResultLine>
          </>
        )}
        {/* Add Trial is the header Actions menu's (MYK9-928); the empty state keeps its own button. */}
      </div>

      {trials.length === 0 ? (
        <ListEmptyState
          icon={Calendar}
          noun={TRIAL_NOUN}
          filtered={false}
          onShowAll={showAll}
          description="No trials have been created for this show yet."
          action={
            canManageThisShow ? { label: 'Add Trial', onClick: openWizard, icon: Plus } : null
          }
        />
      ) : !viewReady ? null : filteredTrials.length === 0 ? (
        <ListEmptyState
          icon={Calendar}
          noun={TRIAL_NOUN}
          filtered
          onShowAll={showAll}
          action={null}
        />
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredTrials.map(trial => {
            const dateParts = trial.trialDate ? getDateParts(trial.trialDate) : null;
            const trialLabel = formatTrialLabel({
              name: trial.name,
              trialNumber: trial.trialNumber,
            });
            const stats = trialStats[trial.id] || EMPTY_STATS;
            const trialCompositeStatus = deriveTrialStatusKey({
              trialStatus: trial.status,
              classCount: stats.classCount,
              completedCount: stats.completedClasses,
              hasStarted: stats.hasStarted,
            });
            const progressPct =
              stats.classCount > 0 ? (stats.completedClasses / stats.classCount) * 100 : 0;
            const showScored = stats.completedClasses > 0;

            // Build type/time line
            const detailParts = [
              trial.trialType ? formatTrialTypeLabel(trial.trialType) : undefined,
              trial.plannedStartTime,
            ].filter(Boolean);
            const detailLine = detailParts.join(' \u00B7 ');

            return (
              <Card
                key={trial.id}
                className="cursor-pointer overflow-hidden border border-border bg-card shadow-sm transition-all hover:shadow-md hover:border-primary/30"
                onClick={() => navigate(`/shows/${showId}/trials/${trial.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={e =>
                  e.key === 'Enter' && navigate(`/shows/${showId}/trials/${trial.id}`)
                }
              >
                <div className="p-4">
                  <div className="flex gap-4 items-start">
                    {/* Date element */}
                    {dateParts && (
                      <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl border-2 border-border bg-background">
                        <span className="text-xs font-semibold uppercase leading-none tracking-wide text-muted-foreground">
                          {dateParts.month}
                        </span>
                        <span className="text-[22px] font-bold leading-tight text-card-foreground">
                          {dateParts.day}
                        </span>
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* Row 1: Name + status badge */}
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-card-foreground truncate">
                          {trialLabel}
                        </h3>
                        <StatusBadge
                          family="trial"
                          status={trialCompositeStatus}
                          className="shrink-0 text-xs"
                          variant="outline"
                        />
                        {canManageThisShow && (
                          <div className="ml-auto -my-2 -mr-2">
                            {trialRowMenu(trial.id, trialLabel)}
                          </div>
                        )}
                      </div>

                      {/* Row 2: Type + time */}
                      {detailLine && (
                        <p className="text-xs text-muted-foreground mb-2">{detailLine}</p>
                      )}

                      {/* Row 3: Progress bar divider */}
                      <div className="h-[3px] rounded-full bg-border overflow-hidden mb-2">
                        {progressPct > 0 && (
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${progressPct}%` }}
                          />
                        )}
                      </div>

                      {/* Row 4: Counts + scored */}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex gap-3">
                          <span>
                            <strong className="text-card-foreground">{stats.classCount}</strong>{' '}
                            classes
                          </span>
                          <span>
                            <strong className="text-card-foreground">
                              {stats.entryCount ?? '—'}
                            </strong>{' '}
                            {stats.entryCount == null ? 'entries unavailable' : 'entries'}
                          </span>
                        </div>
                        {showScored && (
                          <span className="text-xs text-muted-foreground">
                            {stats.completedClasses}/{stats.classCount} scored
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <DataTable
          tableId="trialsTab"
          columns={trialColumns}
          data={tableData}
          onRowClick={row => navigate(`/shows/${showId}/trials/${row.id}`)}
        />
      )}
      {trialDialogs}
    </div>
  );
}
