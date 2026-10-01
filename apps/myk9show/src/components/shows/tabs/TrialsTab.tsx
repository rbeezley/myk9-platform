import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, Plus } from 'lucide-react';
import { useViewPreference, CARD_TABLE_MODES } from '@/hooks/useViewPreference';
import { ViewToggle } from '@/components/common/ViewToggle';
import { ListViewTabs } from '@/components/list-toolkit';
import { EmptyState } from '@/components/common/EmptyState';
import type { Trial } from '@/components/trials/types/trial.types';
import { deriveTrialStatusKey, formatTrialLabel, type ClassStatusValue } from '@myk9/core';
import { parseLocalDateString } from '@/utils/dateLocal';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import { formatTrialTypeLabel } from '@/types/template.types';
import { StatusBadge } from '@/components/status';
import { toast } from 'sonner';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import type { SyncableTrial } from '@/store/trial-store-types';
import { useShowManageScope } from '@/hooks/useShowManageScope';
import { TrialManagementDialogs } from '@/components/trials/TrialDetail/TrialManagementDialogs';
import { SetupRowActionsMenu } from './SetupRowActionsMenu';
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

const EMPTY_ENTRY_COUNTS = new Map<string, number>();

const baseTrialColumns: ColumnDef<TrialRow, unknown>[] = [
  {
    accessorKey: 'trialDate',
    header: 'Date',
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

  const [viewMode, setViewMode] = useViewPreference('trials', 'cards');
  const [statusFilter, setStatusFilter] = useState<TrialsTabStatus>('all');
  // ONE predicate for every manage affordance here (Add, row Edit / Delete): THIS show's owning
  // club, the scope the show shell's Edit show button uses. The global permission is not
  // club-scoped, and this tab also renders on the public show page. Resolving / unavailable
  // read as no.
  const canManageThisShow = useShowManageScope(showId).canManage;
  // Row Edit / Delete (MYK9-900) open the same panel and dialog the trial's own page uses.
  // The trial is a SNAPSHOT taken when the action starts: a successful delete removes it from
  // the store while the dialog is still finishing, and the dialog must not vanish or re-resolve
  // underneath itself.
  const [pendingTrialAction, setPendingTrialAction] = useState<{
    trial: SyncableTrial;
    action: 'edit' | 'delete';
  } | null>(null);
  const parentShow = useShowStore(state => state.shows.find(show => show.id === showId));
  // The edit/delete actions write through the trial STORE, which is not always the source of
  // these rows (a cold store is fed by the server read instead). Hydrate the store first, and
  // never open a dialog for a trial the store cannot resolve.
  const [hydratingTrialId, setHydratingTrialId] = useState<string | null>(null);
  const openTrialAction = async (trialId: string, action: 'edit' | 'delete') => {
    const fromStore = () => useTrialStore.getState().trials.find(trial => trial.id === trialId);
    setHydratingTrialId(trialId);
    try {
      if (!fromStore()) await useTrialStore.getState().loadTrials();
      const trial = fromStore();
      if (!trial) {
        toast.error("We couldn't load this trial. Please refresh and try again.");
        return;
      }
      setPendingTrialAction({ trial, action });
    } finally {
      setHydratingTrialId(null);
    }
  };
  const trialRowMenu = (trialId: string, label: string) => (
    <SetupRowActionsMenu
      subject="Trial"
      rowLabel={label}
      busy={hydratingTrialId === trialId}
      onEdit={() => void openTrialAction(trialId, 'edit')}
      onDelete={() => void openTrialAction(trialId, 'delete')}
    />
  );
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
              meta: { interactive: true, exportDisabled: true },
              cell: ({ row }) => trialRowMenu(row.original.id, row.original.name),
            },
          ]
        : baseTrialColumns,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- trialRowMenu only closes over stable refs/setters
    [canManageThisShow, hydratingTrialId]
  );

  const trialViews = useMemo(() => buildTrialsTabViews(trials, trialStats), [trials, trialStats]);

  const filteredTrials = useMemo(
    () => filterTrialsForTab(trials, trialStats, statusFilter),
    [trials, trialStats, statusFilter]
  );

  const tableData = useMemo<TrialRow[]>(
    () =>
      filteredTrials.map(trial => ({
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
    [filteredTrials, trialStats]
  );

  const openWizard = () =>
    navigate(`/secretary/create-show/wizard?showId=${showId}&mode=add-trials`);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        {trialViews.length > 0 && (
          <ListViewTabs
            label="Trial views"
            views={trialViews}
            activeId={activeTrialsTabViewId(statusFilter)}
            onSelect={id => setStatusFilter(trialsTabViewFilters(id))}
          />
        )}
        <div className="ml-auto flex items-center gap-2">
          <ViewToggle modes={CARD_TABLE_MODES} active={viewMode} onChange={setViewMode} />
          {canManageThisShow && (
            <Button size="sm" onClick={openWizard} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Add Trial
            </Button>
          )}
        </div>
      </div>

      {trials.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No Trials"
          description="No trials have been created for this show yet."
          action={
            canManageThisShow ? { label: 'Add Trial', onClick: openWizard, icon: Plus } : null
          }
        />
      ) : filteredTrials.length === 0 && trials.length > 0 ? (
        <EmptyState
          icon={Calendar}
          variant="filter"
          size="sm"
          title={
            statusFilter === 'pending'
              ? 'All trials completed!'
              : statusFilter === 'completed'
                ? 'No trials completed yet.'
                : 'No trials match the current filter.'
          }
          action={{ label: 'Show all trials', onClick: () => setStatusFilter('all') }}
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
      {canManageThisShow && pendingTrialAction && (
        // Mounted per selection with the trial and action together (and keyed by trial), so the
        // edit form initializes from THIS trial rather than opening against a late-arriving one.
        <TrialManagementDialogs
          key={pendingTrialAction.trial.id}
          currentTrial={pendingTrialAction.trial}
          parentShow={parentShow}
          entryCountByClass={EMPTY_ENTRY_COUNTS}
          initialAction={pendingTrialAction.action}
          onActionFinished={() => setPendingTrialAction(null)}
          onTrialDeleted={() => setPendingTrialAction(null)}
        />
      )}
    </div>
  );
}
