import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard, StatCardSkeleton, CHART_TOOLTIP_STYLE } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  useJudgeRosterSummary,
  useJudgeUtilizationStats,
  useJudgeQualificationAlerts,
  useJudgeAssignmentTrends,
} from '@/hooks/queries/useJudgeAnalyticsQuery';
import { exportToCSV } from '@/lib/export';
import type { JudgeUtilizationRow } from '@/services/database/queries/judgeQueries';
import type { JudgeQualification } from '@/types/judge-management';
import {
  Scale,
  Users,
  AlertTriangle,
  Calendar,
  Download,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// -- Skeleton for loading state -----------------------------------------------

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-12 bg-muted/50 rounded animate-pulse" />
      ))}
    </div>
  );
}

// -- Sort helper --------------------------------------------------------------

type SortField = 'name' | 'show_count' | 'class_count' | 'confirmed_count' | 'total_fees';
type SortDir = 'asc' | 'desc';

function sortRows(rows: JudgeUtilizationRow[], field: SortField, dir: SortDir) {
  return [...rows].sort((a, b) => {
    let cmp = 0;
    if (field === 'name') {
      cmp = `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`);
    } else {
      cmp = a[field] - b[field];
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}

// -- Sort icon (extracted outside component to avoid re-creation per render) ---

function SortIcon({
  field,
  activeField,
  activeDir,
}: {
  field: SortField;
  activeField: SortField;
  activeDir: SortDir;
}) {
  if (field !== activeField) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
  return activeDir === 'asc' ? (
    <ChevronUp className="h-3 w-3 ml-1" />
  ) : (
    <ChevronDown className="h-3 w-3 ml-1" />
  );
}

// -- Main page ----------------------------------------------------------------

const JudgeAnalyticsPage: React.FC = () => {
  const { data: roster, isLoading: rosterLoading, error: rosterError } = useJudgeRosterSummary();
  const {
    data: utilization,
    isLoading: utilizationLoading,
    error: utilizationError,
  } = useJudgeUtilizationStats();
  const {
    data: alerts,
    isLoading: alertsLoading,
    error: alertsError,
  } = useJudgeQualificationAlerts(60);
  const { data: trends, isLoading: trendsLoading } = useJudgeAssignmentTrends();

  const [sortField, setSortField] = useState<SortField>('show_count');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const handleExportCSV = () => {
    if (!utilization) return;
    const exportData = utilization.map(row => ({
      'Judge Name': `${row.first_name} ${row.last_name}`,
      Shows: row.show_count,
      'Classes Judged': row.class_count,
      Confirmed: row.confirmed_count,
      Declined: row.declined_count,
      'Acceptance Rate':
        row.confirmed_count + row.declined_count > 0
          ? `${Math.round((row.confirmed_count / (row.confirmed_count + row.declined_count)) * 100)}%`
          : 'N/A',
      'Total Fees': `$${row.total_fees.toFixed(2)}`,
    }));
    exportToCSV(exportData, `judge-utilization-${new Date().toISOString().split('T')[0]}`);
  };

  const sortedUtilization = useMemo(
    () => (utilization ? sortRows(utilization, sortField, sortDir) : []),
    [utilization, sortField, sortDir]
  );

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Judge Analytics</h1>
          <p className="text-muted-foreground text-lg">
            Roster overview, utilization, and qualification status
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleExportCSV}
          disabled={!utilization?.length}
          className="border-primary/20 text-primary hover:bg-primary/5"
        >
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Roster Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {rosterLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : rosterError ? (
          <Card className="col-span-4 p-6 text-center text-destructive">
            Failed to load roster summary. Please try again.
          </Card>
        ) : (
          <>
            <StatCard
              title="Total Judges"
              value={roster?.totalJudges ?? 0}
              icon={Users}
              subtitle="With qualifications"
            />
            <StatCard
              title="Active Qualifications"
              value={roster?.activeQualifications ?? 0}
              icon={Scale}
              subtitle="Currently valid"
            />
            <StatCard
              title="Expiring Soon"
              value={roster?.expiringSoon ?? 0}
              icon={AlertTriangle}
              subtitle="Within 30 days"
            />
            <StatCard
              title="Assignments This Month"
              value={roster?.totalAssignmentsThisMonth ?? 0}
              icon={Calendar}
              subtitle="New this month"
            />
          </>
        )}
      </div>

      {/* Utilization Table */}
      <Card className="bg-card/95 backdrop-blur-sm border-border/50 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Judge Utilization</CardTitle>
        </CardHeader>
        <CardContent>
          {utilizationLoading ? (
            <TableSkeleton />
          ) : utilizationError ? (
            <p className="text-center text-destructive py-4">Failed to load utilization data.</p>
          ) : sortedUtilization.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Scale className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p>No judge assignments yet.</p>
              <p className="text-sm mt-1">Assign judges to shows to see analytics here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    {(
                      [
                        ['name', 'Judge'],
                        ['show_count', 'Shows'],
                        ['class_count', 'Classes'],
                        ['confirmed_count', 'Acceptance Rate'],
                        ['total_fees', 'Total Fees'],
                      ] as [SortField, string][]
                    ).map(([field, label]) => (
                      <th
                        key={field}
                        className="text-left py-3 px-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none"
                        onClick={() => handleSort(field)}
                      >
                        <span className="flex items-center">
                          {label}
                          <SortIcon field={field} activeField={sortField} activeDir={sortDir} />
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedUtilization.map(row => {
                    const total = row.confirmed_count + row.declined_count;
                    const rate = total > 0 ? Math.round((row.confirmed_count / total) * 100) : null;
                    return (
                      <tr
                        key={row.person_id}
                        className="border-b border-border/30 hover:bg-muted/20 transition-colors"
                      >
                        <td className="py-3 px-3 font-medium">
                          {row.first_name} {row.last_name}
                        </td>
                        <td className="py-3 px-3">{row.show_count}</td>
                        <td className="py-3 px-3">{row.class_count}</td>
                        <td className="py-3 px-3">
                          {rate !== null ? (
                            <span
                              className={
                                rate >= 80
                                  ? 'text-emerald-500'
                                  : rate >= 50
                                    ? 'text-amber-500'
                                    : 'text-red-500'
                              }
                            >
                              {rate}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground">N/A</span>
                          )}
                        </td>
                        <td className="py-3 px-3">${row.total_fees.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bottom row: Alerts + Trends chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Qualification Alerts */}
        <Card className="bg-card/95 backdrop-blur-sm border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl font-semibold flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Qualification Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {alertsLoading ? (
              <TableSkeleton />
            ) : alertsError ? (
              <p className="text-center text-destructive py-4">Failed to load alerts.</p>
            ) : !alerts?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No qualification alerts.</p>
                <p className="text-sm mt-1">All qualifications are current.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[360px] overflow-y-auto">
                {alerts.map(
                  (
                    alert: JudgeQualification & {
                      people: { first_name: string; last_name: string } | null;
                    }
                  ) => {
                    const isExpired =
                      alert.expiration_date && new Date(alert.expiration_date) < new Date();
                    const isSuspended = !!alert.suspension_date;
                    return (
                      <div
                        key={alert.id}
                        className="flex items-center justify-between p-3 border border-border/50 rounded-lg"
                      >
                        <div>
                          <p className="font-medium text-sm">
                            {alert.people?.first_name} {alert.people?.last_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {alert.organization} — {alert.qualification_level}
                          </p>
                        </div>
                        {isSuspended ? (
                          <Badge variant="destructive">Suspended</Badge>
                        ) : isExpired ? (
                          <Badge variant="destructive">Expired</Badge>
                        ) : (
                          <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 border">
                            Expiring
                          </Badge>
                        )}
                      </div>
                    );
                  }
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Assignment Trends Chart */}
        <Card className="bg-card/95 backdrop-blur-sm border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Assignment Trends</CardTitle>
          </CardHeader>
          <CardContent>
            {trendsLoading ? (
              <div className="h-[300px] bg-muted/30 rounded animate-pulse" />
            ) : !trends?.some(t => t.count > 0) ? (
              <div className="text-center py-8 text-muted-foreground h-[300px] flex flex-col items-center justify-center">
                <Calendar className="h-8 w-8 mb-3 opacity-40" />
                <p>No assignment data for this year.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={trends} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default JudgeAnalyticsPage;
