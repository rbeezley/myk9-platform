/**
 * Judge Personal Stats Page
 *
 * INTENT: "Invisible technology" — quick glance, no cognitive load.
 * Shows season summary, upcoming assignments, and qualification status.
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard, StatCardSkeleton, StatsGrid } from '@myk9/ui';
import { Badge } from '@/components/ui/badge';
import { useAuthContext } from '@/hooks/useAuthContext';
import {
  useMyJudgeStats,
  useUpcomingJudgeAssignments,
  useJudgeQualificationSummary,
} from '@/hooks/queries/useJudgeAnalyticsQuery';
import { Trophy, Calendar, DollarSign, Scale, Clock } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const CHART_TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
};

const STATUS_COLORS: Record<string, string> = {
  confirmed: '#10b981',
  completed: '#10b981',
  invited: '#fbbf24',
  declined: '#ef4444',
  cancelled: '#8b5cf6',
};

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Confirmed',
  completed: 'Completed',
  invited: 'Invited',
  declined: 'Declined',
  cancelled: 'Cancelled',
};

const JudgeStatsPage: React.FC = () => {
  const { user } = useAuthContext();
  const personId = user?.id;

  const { data: stats, isLoading: statsLoading } = useMyJudgeStats(personId);
  const { data: upcoming, isLoading: upcomingLoading } = useUpcomingJudgeAssignments(personId);
  const { data: qualSummary, isLoading: qualLoading } = useJudgeQualificationSummary(personId);

  const currentYear = new Date().getFullYear();

  // Build pie chart data from status breakdown
  const pieData = stats
    ? Object.entries(stats.statusBreakdown)
        .filter(([, count]) => count > 0)
        .map(([status, count]) => ({
          name: STATUS_LABELS[status] ?? status,
          value: count,
          color: STATUS_COLORS[status] ?? '#94a3b8',
        }))
    : [];

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-4xl font-bold tracking-tight">My Stats</h1>
        <p className="text-muted-foreground text-lg">{currentYear} season overview</p>
      </div>

      {/* Season Summary Cards */}
      <StatsGrid columns={4}>
        {statsLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              title="Shows Judged"
              value={stats?.showsJudged ?? 0}
              icon={Trophy}
              subtitle={`${currentYear} season`}
              color="primary"
            />
            <StatCard
              title="Classes Judged"
              value={stats?.classesJudged ?? 0}
              icon={Scale}
              subtitle="Total assignments"
              color="purple"
            />
            <StatCard
              title="Upcoming"
              value={upcoming?.length ?? 0}
              icon={Calendar}
              subtitle="Confirmed or invited"
              color="blue"
            />
            <StatCard
              title="Total Fees"
              value={`$${(stats?.totalFees ?? 0).toFixed(0)}`}
              icon={DollarSign}
              subtitle={`${currentYear} earnings`}
              color="emerald"
            />
          </>
        )}
      </StatsGrid>

      {/* Bottom row: Status breakdown + Upcoming + Qualifications */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Assignment Status Breakdown */}
        <Card className="bg-card/95 backdrop-blur-sm border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Assignment Status</CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="h-[200px] bg-muted/30 rounded animate-pulse" />
            ) : pieData.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No assignments this year.</p>
                <p className="text-sm mt-1">Your stats will appear after your first assignment.</p>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      dataKey="value"
                      paddingAngle={2}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-3 mt-2 justify-center">
                  {pieData.map(entry => (
                    <div key={entry.name} className="flex items-center gap-1.5 text-sm">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: entry.color }}
                      />
                      <span className="text-muted-foreground">
                        {entry.name}: {entry.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Assignments */}
        <Card className="bg-card/95 backdrop-blur-sm border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Upcoming Assignments</CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-12 bg-muted/50 rounded animate-pulse" />
                ))}
              </div>
            ) : !upcoming?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-8 w-8 mx-auto mb-3 opacity-40" />
                <p>No upcoming assignments.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {upcoming.map(assignment => (
                  <div
                    key={assignment.id}
                    className="flex items-center justify-between p-3 border border-border/50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-sm">{assignment.show_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {assignment.show_start_date
                          ? new Date(assignment.show_start_date).toLocaleDateString()
                          : 'Date TBD'}
                        {assignment.fee ? ` — $${assignment.fee}` : ''}
                      </p>
                    </div>
                    <Badge
                      className={
                        assignment.status === 'confirmed'
                          ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 border'
                          : 'bg-amber-500/10 text-amber-600 border-amber-500/20 border'
                      }
                    >
                      {assignment.status === 'confirmed' ? 'Confirmed' : 'Invited'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Qualification Status */}
        <Card className="bg-card/95 backdrop-blur-sm border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl font-semibold">My Qualifications</CardTitle>
          </CardHeader>
          <CardContent>
            {qualLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-12 bg-muted/50 rounded animate-pulse" />
                ))}
              </div>
            ) : !qualSummary || qualSummary.total_qualifications === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Scale className="h-8 w-8 mx-auto mb-3 opacity-40" />
                <p>No qualifications on file.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center p-3 bg-emerald-500/5 rounded-lg border border-emerald-500/10">
                    <p className="text-2xl font-bold text-emerald-500">
                      {qualSummary.active_qualifications}
                    </p>
                    <p className="text-xs text-muted-foreground">Active</p>
                  </div>
                  <div className="text-center p-3 bg-amber-500/5 rounded-lg border border-amber-500/10">
                    <p className="text-2xl font-bold text-amber-500">{qualSummary.expiring_soon}</p>
                    <p className="text-xs text-muted-foreground">Expiring Soon</p>
                  </div>
                </div>
                {qualSummary.organizations.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                      Organizations
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {qualSummary.organizations.map(org => (
                        <Badge key={org} variant="secondary">
                          {org}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {qualSummary.disciplines.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                      Disciplines
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {qualSummary.disciplines.map(disc => (
                        <Badge key={disc} variant="outline">
                          {disc}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default JudgeStatsPage;
