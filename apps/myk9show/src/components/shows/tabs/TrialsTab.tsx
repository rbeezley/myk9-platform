import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Plus } from 'lucide-react';
import { useViewPreference, CARD_TABLE_MODES } from '@/hooks/useViewPreference';
import { ViewToggle } from '@/components/common/ViewToggle';
import { StatusFilter, type StatusFilterValue } from '@/components/common/StatusFilter';
import { FilterEmptyState } from '@/components/common/FilterEmptyState';
import type { Trial } from '@/components/trials/types/trial.types';
import { useRBAC } from '@/hooks/useRBAC';
import {
  getClassStatusBadgeClasses,
  getClassStatusDisplay,
  CLASS_STATUS,
  type ClassStatusValue,
} from '@myk9/core';
import { parseLocalDateString } from '@/utils/dateLocal';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';

export interface TrialStats {
  classCount: number;
  entryCount: number;
  completedClasses: number;
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

const EMPTY_STATS: TrialStats = { classCount: 0, entryCount: 0, completedClasses: 0 };

function getTrialStatusTokens(status: string): {
  border: string;
  text: string;
  bar: string;
} {
  if (status === CLASS_STATUS.COMPLETED) {
    return { border: 'border-green-600', text: 'text-green-600', bar: 'bg-green-600' };
  }
  if (status === CLASS_STATUS.IN_PROGRESS) {
    return { border: 'border-blue-500', text: 'text-blue-500', bar: 'bg-blue-500' };
  }
  return { border: 'border-border', text: 'text-blue-500', bar: 'bg-blue-500' };
}

interface TrialRow {
  id: string;
  trialDate: string;
  name: string;
  trialNumber: string;
  trialType: string | undefined;
  plannedStartTime: string | undefined;
  status: ClassStatusValue;
  classCount: number;
  entryCount: number;
  completedClasses: number;
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
  { accessorKey: 'trialType', header: 'Type', meta: { responsiveHide: 'md' as const } },
  { accessorKey: 'plannedStartTime', header: 'Time', meta: { responsiveHide: 'md' as const } },
  { accessorKey: 'classCount', header: 'Classes' },
  { accessorKey: 'entryCount', header: 'Entries' },
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
      <Badge className={`text-[10px] ${getClassStatusBadgeClasses(row.original.status)}`}>
        {getClassStatusDisplay(row.original.status).label}
      </Badge>
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
      if (trial.status === CLASS_STATUS.COMPLETED) completed++;
    }
    return { all: trials.length, pending: trials.length - completed, completed };
  }, [trials]);

  const filteredTrials = useMemo(() => {
    if (statusFilter === 'all') return trials;
    return trials.filter(trial => {
      const isCompleted = trial.status === CLASS_STATUS.COMPLETED;
      return statusFilter === 'completed' ? isCompleted : !isCompleted;
    });
  }, [trials, statusFilter]);

  const tableData = useMemo<TrialRow[]>(
    () =>
      filteredTrials.map(trial => ({
        id: trial.id,
        trialDate: trial.trialDate,
        name: trial.name || `Trial ${trial.trialNumber}`,
        trialNumber: trial.trialNumber,
        trialType: trial.trialType,
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
        <div className="py-16 text-center">
          <Calendar className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
          <h3 className="text-lg font-medium text-foreground">No Trials</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            No trials have been created for this show yet.
          </p>
          {canManage && (
            <Button variant="outline" className="mt-4 gap-1.5" onClick={openWizard}>
              <Plus className="h-4 w-4" />
              New Trial
            </Button>
          )}
        </div>
      ) : filteredTrials.length === 0 && trials.length > 0 ? (
        <FilterEmptyState
          noun="trials"
          statusFilter={statusFilter}
          onReset={() => setStatusFilter('all')}
        />
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredTrials.map(trial => {
            const dateParts = trial.trialDate ? getDateParts(trial.trialDate) : null;
            const stats = trialStats[trial.id] || EMPTY_STATS;
            const tokens = getTrialStatusTokens(trial.status);
            const progressPct =
              stats.classCount > 0 ? (stats.completedClasses / stats.classCount) * 100 : 0;
            const showScored = stats.completedClasses > 0;

            // Build type/time line
            const detailParts = [trial.trialType, trial.plannedStartTime].filter(Boolean);
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
                      <div
                        className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl border-2 bg-background ${tokens.border}`}
                      >
                        <span
                          className={`text-[10px] font-semibold uppercase leading-none tracking-wide ${tokens.text}`}
                        >
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
                        <Badge
                          className={`shrink-0 text-[10px] ${getClassStatusBadgeClasses(trial.status)}`}
                        >
                          {getClassStatusDisplay(trial.status).label}
                        </Badge>
                      </div>

                      {/* Row 2: Type + time */}
                      {detailLine && (
                        <p className="text-xs text-muted-foreground mb-2">{detailLine}</p>
                      )}

                      {/* Row 3: Progress bar divider */}
                      <div className="h-[3px] rounded-full bg-border overflow-hidden mb-2">
                        {progressPct > 0 && (
                          <div
                            className={`h-full rounded-full ${tokens.bar}`}
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
                            <strong className="text-card-foreground">{stats.entryCount}</strong>{' '}
                            entries
                          </span>
                        </div>
                        {showScored && (
                          <span className={`text-[11px] ${tokens.text}`}>
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
