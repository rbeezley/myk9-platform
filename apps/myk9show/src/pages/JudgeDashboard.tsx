import React, { useState, useEffect } from 'react';
import { DashboardGreeting } from '@/components/ui/DashboardGreeting';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TabsContent } from '@/components/ui/tabs';
import { PrimaryTabs, type PrimaryTabDef } from '@/components/common/PrimaryTabs';
import { useAuthContext } from '@/hooks/useAuthContext';
import { auditService } from '@/services/AuditService';
import { AuditAction } from '@/types/audit-types';
import { logger } from '@/services/LoggingService';
import { GlassCard } from '@/components/common/GlassCard';
import { LoadingEmptyState } from '@/components/common/EmptyState';
import {
  Trophy,
  Clock,
  Users,
  CheckCircle2,
  Circle,
  AlertCircle,
  Calendar,
  ArrowRight,
  Timer,
  CalendarDays,
  CheckCircle,
  Eye,
  Play,
} from 'lucide-react';
import { StaggeredGrid } from '@/components/layout/StaggeredGrid';
import { FadeIn } from '@/components/layout/FadeIn';
import {
  deriveJudgeDashboardStats,
  splitJudgeAssignments,
  localIsoDate,
  type JudgeClass,
} from './judgeStatsUtils';
import { useJudgeAssignments } from '@/hooks/queries/useJudgeAssignments';
import { formatRingLabel } from '@/utils/ringLabel';

const JUDGE_TABS: PrimaryTabDef[] = [
  { id: 'today', label: 'Today', icon: CalendarDays },
  { id: 'upcoming', label: 'Upcoming', icon: Calendar },
  { id: 'completed', label: 'Completed', icon: CheckCircle },
];

const getStatusIcon = (status: JudgeClass['status']) => {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="h-5 w-5 text-[#34C759]" />;
    case 'in-progress':
      return <Timer className="h-5 w-5 text-[#007AFF] animate-pulse" />;
    default:
      return <Circle className="h-5 w-5 text-muted-foreground" />;
  }
};

const getStatusBadge = (status: JudgeClass['status']) => {
  switch (status) {
    case 'completed':
      return (
        <Badge className="bg-success-green/10 text-success-green border-success-green/20 border">
          Completed
        </Badge>
      );
    case 'in-progress':
      return (
        <Badge className="bg-primary/10 text-primary border-primary/20 border">In Progress</Badge>
      );
    default:
      return (
        <Badge className="bg-muted text-muted-foreground border-border border">Pending</Badge>
      );
  }
};

interface AssignmentRowProps {
  judgeClass: JudgeClass;
  showDate?: boolean;
  onStartJudging?: (judgeClass: JudgeClass) => void;
  onViewResults?: (judgeClass: JudgeClass) => void;
}

const AssignmentRow: React.FC<AssignmentRowProps> = ({
  judgeClass,
  showDate = false,
  onStartJudging,
  onViewResults,
}) => {
  const ringLabel = formatRingLabel(judgeClass.ringNumber);
  const isCompleted = judgeClass.status === 'completed';

  return (
    <div className="group relative overflow-hidden flex items-center justify-between p-4 sm:p-6 border border-border rounded-2xl bg-gradient-to-r from-card to-card/80 hover:from-card/95 hover:to-card/90 transition-all duration-500 hover:shadow-xl hover:-translate-y-1 active:scale-[0.99]">
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="relative flex items-center gap-4">
        {getStatusIcon(judgeClass.status)}
        <div>
          <h3 className="font-bold text-lg text-foreground group-hover:text-primary transition-colors duration-300">
            {judgeClass.name}
          </h3>
          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
            {ringLabel && <span>{ringLabel}</span>}
            {ringLabel && <span>&bull;</span>}
            {showDate && (
              <>
                <span>
                  {judgeClass.scheduledTime.toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                <span>&bull;</span>
              </>
            )}
            <span>
              {judgeClass.scheduledTime.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <span>&bull;</span>
            <span>
              {isCompleted
                ? `${judgeClass.totalEntries} entries judged`
                : `${judgeClass.completedEntries}/${judgeClass.totalEntries} entries`}
            </span>
          </div>
        </div>
      </div>
      <div className="relative flex items-center gap-2">
        {getStatusBadge(judgeClass.status)}
        {!isCompleted && onStartJudging && (
          <Button
            size="sm"
            onClick={() => onStartJudging(judgeClass)}
            className="bg-primary text-primary-foreground hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
          >
            {judgeClass.status === 'in-progress' ? 'Continue' : 'Start'} Judging
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        )}
        {isCompleted && onViewResults && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onViewResults(judgeClass)}
            className="relative border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300"
          >
            <Eye className="h-4 w-4 mr-2" />
            View Results
          </Button>
        )}
      </div>
    </div>
  );
};

const TabEmptyState: React.FC<{ icon: React.ReactNode; title: string; body: string }> = ({
  icon,
  title,
  body,
}) => (
  <div className="flex flex-col items-center justify-center py-16">
    <div className="mx-auto w-24 h-24 bg-gradient-to-br from-primary/20 to-primary/10 rounded-full flex items-center justify-center mb-6">
      {icon}
    </div>
    <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
    <p className="text-muted-foreground max-w-sm text-center">{body}</p>
  </div>
);

const JudgeDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, firstName } = useAuthContext();
  const [selectedTab, setSelectedTab] = useState('today');
  const { assignments, isLoading, isFetching, isError, refetch } = useJudgeAssignments();

  // Live clock so the "next class in Xm" countdown stays current.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    auditService.log({
      action: AuditAction.READ,
      entityType: 'judge_dashboard',
      entityId: user?.id || 'unknown',
      metadata: { page: 'judge_dashboard', loadTime: new Date().toISOString() },
    });
  }, [user?.id]);

  const buckets = splitJudgeAssignments(assignments, localIsoDate(now));
  const {
    completedCount,
    totalEntries,
    judgedEntries,
    completionRate,
    nextClass,
    minutesUntilNext,
  } = deriveJudgeDashboardStats(buckets.today, now);

  const handleStartJudging = (judgeClass: JudgeClass) => {
    // Audit is fire-and-forget; never block the judge's path to the ring on it.
    void auditService
      .log({
        action: AuditAction.UPDATE,
        entityType: 'judge_class',
        entityId: judgeClass.id,
        metadata: { action: 'start_judging', classId: judgeClass.classId, judgeId: user?.id },
      })
      .catch(error => logger.error('Failed to log start of judging', 'pages', {}, error as Error));
    navigate(`/at-show/${judgeClass.showId}/class/${judgeClass.classId}`);
  };

  const handleViewResults = (judgeClass: JudgeClass) => {
    navigate(`/at-show/${judgeClass.showId}/class/${judgeClass.classId}`);
  };

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto">
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-2">
            <DashboardGreeting
              firstName={firstName}
              className="text-2xl sm:text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent"
            />
            <p className="text-muted-foreground text-lg font-medium">
              Manage your judging assignments
            </p>
          </div>
          {/* INTENT: judge — "invisible technology". One tap from the landing page
              to the ring: this deep-links into ringside for today's active show. */}
          {nextClass && (
            <Button
              onClick={() => navigate(`/at-show/${nextClass.showId}`)}
              className="bg-primary text-primary-foreground hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
            >
              <Play className="h-4 w-4 mr-2" />
              Open Ringside Scoring
            </Button>
          )}
        </div>

        {/* Statistics Cards */}
        <StaggeredGrid className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <GlassCard>
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold flex items-center justify-between text-muted-foreground">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl shadow-sm group-hover:shadow-xl group-hover:scale-110 transition-all duration-300">
                    <Trophy className="h-5 w-5 text-primary" />
                  </div>
                  Today&apos;s Classes
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-4xl font-bold mb-2 bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                {buckets.today.length}
              </div>
              <p className="text-sm text-muted-foreground font-medium">
                {completedCount} completed
              </p>
            </CardContent>
          </GlassCard>

          <GlassCard overlayGradient="from-blue-500/5">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold flex items-center justify-between text-muted-foreground">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gradient-to-br from-blue-500/20 to-blue-500/10 rounded-xl shadow-sm group-hover:shadow-xl group-hover:scale-110 transition-all duration-300">
                    <Users className="h-5 w-5 text-blue-500" />
                  </div>
                  Total Entries
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-4xl font-bold mb-2 bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                {totalEntries}
              </div>
              <p className="text-sm text-muted-foreground font-medium">{judgedEntries} judged</p>
            </CardContent>
          </GlassCard>

          <GlassCard overlayGradient="from-warning-orange/5">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold flex items-center justify-between text-muted-foreground">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gradient-to-br from-warning-orange/20 to-warning-orange/10 rounded-xl shadow-sm group-hover:shadow-xl group-hover:scale-110 transition-all duration-300">
                    <Clock className="h-5 w-5 text-warning-orange" />
                  </div>
                  Next Class
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-4xl font-bold mb-2 bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                {minutesUntilNext !== null ? `${minutesUntilNext}m` : '—'}
              </div>
              <p className="text-sm text-muted-foreground font-medium">
                {nextClass ? nextClass.name : 'No classes today'}
              </p>
            </CardContent>
          </GlassCard>

          <GlassCard overlayGradient="from-success-green/5">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold flex items-center justify-between text-muted-foreground">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gradient-to-br from-success-green/20 to-success-green/10 rounded-xl shadow-sm group-hover:shadow-xl group-hover:scale-110 transition-all duration-300">
                    <CheckCircle2 className="h-5 w-5 text-success-green" />
                  </div>
                  Completion Rate
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-4xl font-bold mb-2 bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                {completionRate !== null ? `${completionRate}%` : '—'}
              </div>
              <div className="flex items-center gap-1">
                {completionRate !== null && (
                  <div className="h-2 w-2 bg-success-green rounded-full animate-pulse" />
                )}
                <span
                  className={`text-sm font-medium ${completionRate !== null ? 'text-success-green' : 'text-muted-foreground'}`}
                >
                  {completionRate !== null ? 'On schedule' : 'No data yet'}
                </span>
              </div>
            </CardContent>
          </GlassCard>
        </StaggeredGrid>

        {/* Classes List */}
        <FadeIn>
          <Card className="bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl font-semibold">Judging Assignments</CardTitle>
              <CardDescription className="text-muted-foreground">
                Your scheduled classes for judging
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isError ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <AlertCircle className="h-12 w-12 text-warning-orange mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    We couldn&apos;t load your assignments
                  </h3>
                  <p className="text-muted-foreground max-w-sm mb-6">
                    Check your connection and try again.
                  </p>
                  <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
                    {isFetching ? 'Retrying…' : 'Retry'}
                  </Button>
                </div>
              ) : isLoading ? (
                <LoadingEmptyState message="Loading your assignments…" />
              ) : (
                <PrimaryTabs
                  tabs={JUDGE_TABS}
                  value={selectedTab}
                  onValueChange={setSelectedTab}
                  className="space-y-6"
                >
                  <TabsContent value="today" className="space-y-4">
                    {buckets.today.map(judgeClass => (
                      <AssignmentRow
                        key={judgeClass.id}
                        judgeClass={judgeClass}
                        onStartJudging={handleStartJudging}
                        onViewResults={handleViewResults}
                      />
                    ))}

                    {buckets.today.length === 0 &&
                      (assignments.length === 0 ? (
                        <TabEmptyState
                          icon={<Trophy className="h-12 w-12 text-primary" />}
                          title="No Judging Assignments Yet"
                          body="When a club assigns you to judge a class, it will appear here automatically. No setup needed."
                        />
                      ) : (
                        <TabEmptyState
                          icon={<Trophy className="h-12 w-12 text-primary" />}
                          title="No Classes Today"
                          body={
                            buckets.upcoming.length > 0
                              ? 'You have no classes scheduled for today. Check the Upcoming tab for your next assignment.'
                              : 'You have no classes scheduled for today.'
                          }
                        />
                      ))}
                  </TabsContent>

                  <TabsContent value="upcoming" className="mt-4 space-y-4">
                    {buckets.upcoming.map(judgeClass => (
                      <AssignmentRow key={judgeClass.id} judgeClass={judgeClass} showDate />
                    ))}

                    {buckets.upcoming.length === 0 && (
                      <TabEmptyState
                        icon={<Calendar className="h-12 w-12 text-blue-500" />}
                        title="No Upcoming Classes"
                        body="Your upcoming judging assignments will appear here when scheduled."
                      />
                    )}
                  </TabsContent>

                  <TabsContent value="completed" className="mt-4 space-y-4">
                    {buckets.completed.map(judgeClass => (
                      // Past unfinished classes appear here with their true status
                      // badge and a Continue Judging action, so they stay reachable.
                      <AssignmentRow
                        key={judgeClass.id}
                        judgeClass={judgeClass}
                        showDate
                        onStartJudging={handleStartJudging}
                        onViewResults={handleViewResults}
                      />
                    ))}

                    {buckets.completed.length === 0 && (
                      <TabEmptyState
                        icon={<CheckCircle2 className="h-12 w-12 text-success-green" />}
                        title="No Completed Classes"
                        body="Completed judging assignments will appear here."
                      />
                    )}
                  </TabsContent>
                </PrimaryTabs>
              )}
            </CardContent>
          </Card>
        </FadeIn>
      </div>
    </div>
  );
};

export default JudgeDashboard;
