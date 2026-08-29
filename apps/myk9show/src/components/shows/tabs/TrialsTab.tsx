import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, Plus } from 'lucide-react';
import { useViewPreference, CARD_TABLE_MODES } from '@/hooks/useViewPreference';
import { ViewToggle } from '@/components/common/ViewToggle';
import { StatusFilter, type StatusFilterValue } from '@/components/common/StatusFilter';
import { EmptyState } from '@/components/common/EmptyState';
import type { Trial } from '@/components/trials/types/trial.types';
import { useRBAC } from '@/hooks/useRBAC';
import { deriveTrialStatusKey, type ClassStatusValue } from '@myk9/core';
import { parseLocalDateString } from '@/utils/dateLocal';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import { formatTrialTypeLabel } from '@/types/template.types';
import { StatusBadge } from '@/components/status';

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

function getTrialDisplayStatus(trial: Trial, trialStats: Record<string, TrialStats>) {
  const stats = trialStats[trial.id] || EMPTY_STATS;
  return deriveTrialStatusKey({
    trialStatus: trial.status,
    classCount: stats.classCount,
    completedCount: stats.completedClasses,
    hasStarted: stats.hasStarted,
  });
}

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

const trialColumns: ColumnDef<TrialRow, unknown>[] = [
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
  const { hasPermission } = useRBAC();

  const [viewMode, setViewMode] = useViewPreference('trials', 'cards');
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all');
  const canManage = hasPermission('admin:manage') || hasPermission('show:manage');

  const statusCounts = useMemo(() => {
    let completed = 0;
    for (const trial of trials) {
      if (getTrialDisplayStatus(trial, trialStats) === 'completed') completed++;
    }
    return { all: trials.length, pending: trials.length - completed, completed };
  }, [trials, trialStats]);

  const filteredTrials = useMemo(() => {
    if (statusFilter === 'all') return trials;
    return trials.filter(trial => {
      const isCompleted = getTrialDisplayStatus(trial, trialStats) === 'completed';
      return statusFilter === 'completed' ? isCompleted : !isCompleted;
    });
  }, [trials, trialStats, statusFilter]);

  const tableData = useMemo<TrialRow[]>(
    () =>
      filteredTrials.map(trial => ({
        id: trial.id,
        trialDate: trial.trialDate,
        name: trial.name || `Trial ${trial.trialNumber}`,
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
        <StatusFilter
          filter={statusFilter}
          onFilterChange={setStatusFilter}
          counts={statusCounts}
        />
        <div className="ml-auto flex items-center gap-2">
          <ViewToggle modes={CARD_TABLE_MODES} active={viewMode} onChange={setViewMode} />
          {canManage && (
            <Button size="sm" onClick={openWizard} className="gap-1.5">
              <Plus className="h-4 w-4" />
              New Trial
            </Button>
          )}
        </div>
      </div>

      {trials.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No Trials"
          description="No trials have been created for this show yet."
          action={canManage ? { label: 'New Trial', onClick: openWizard, icon: Plus } : null}
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
                          {trial.name || `Trial ${trial.trialNumber}`}
                        </h3>
                        <StatusBadge
                          family="trial"
                          status={trialCompositeStatus}
                          className="shrink-0 text-xs"
                          variant="outline"
                        />
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
    </div>
  );
}
