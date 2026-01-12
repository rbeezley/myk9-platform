import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useStatusUpdates, notificationService } from '@/services/NotificationService';
import { auditService } from '@/services/AuditService';
import { UserRole } from '@/types/auth-types';
import { AuditAction, NotificationType } from '@/types/audit-types';
import { logger } from '@/services/LoggingService';
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
  Shield
} from 'lucide-react';

interface JudgeClass {
  id: string;
  showId: string;
  trialId: string;
  classId: string;
  name: string;
  element: string;
  level: string;
  scheduledTime: Date;
  ringNumber: number;
  totalEntries: number;
  completedEntries: number;
  status: 'pending' | 'in-progress' | 'completed';
}

const JudgeDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, hasRole } = useAuthContext();
  const [selectedTab, setSelectedTab] = useState('today');
  const [assignments, setAssignments] = useState<JudgeClass[]>([]);

  // Real-time status updates for judge assignments
  const assignmentUpdates = useStatusUpdates('judge_assignments', user?.id || '');

  const handleAssignmentUpdate = useCallback((update: Record<string, unknown>) => {
    // Handle real-time updates to assignments
    if (update.type === 'assignment_created' || update.type === 'assignment_updated') {
      // Would call loadJudgeData(); to refresh data
      logger.debug('Assignment update received:', 'pages', { data: update });
    }
  }, []);

  const loadJudgeData = async () => {
    // Mock data - replace with actual data from stores
    const mockClasses: JudgeClass[] = [
    {
      id: '1',
      showId: 'show-001',
      trialId: 'trial-001',
      classId: 'class-001',
      name: 'Interior Novice A',
      element: 'Interior',
      level: 'Novice',
      scheduledTime: new Date(Date.now() + 30 * 60000),
      ringNumber: 1,
      totalEntries: 24,
      completedEntries: 0,
      status: 'pending'
    },
    {
      id: '2',
      showId: 'show-001',
      trialId: 'trial-001',
      classId: 'class-002',
      name: 'Container Excellent',
      element: 'Container',
      level: 'Excellent',
      scheduledTime: new Date(Date.now() + 90 * 60000),
      ringNumber: 1,
      totalEntries: 18,
      completedEntries: 0,
      status: 'pending'
    }
    ];
    setAssignments(mockClasses);
  };

  // Load judge data and set up effects
  useEffect(() => {
    if (hasRole(UserRole.JUDGE) || hasRole(UserRole.SITE_ADMIN)) {
      loadJudgeData();
      auditService.log({
        action: AuditAction.READ,
        entityType: 'judge_dashboard',
        entityId: user?.id || 'unknown',
        metadata: {
          page: 'judge_dashboard',
          loadTime: new Date().toISOString()
        }
      });
    }
  }, [user?.id, hasRole]);

  useEffect(() => {
    if (assignmentUpdates && (hasRole(UserRole.JUDGE) || hasRole(UserRole.SITE_ADMIN))) {
      // Handle real-time assignment updates
      handleAssignmentUpdate(assignmentUpdates);
    }
  }, [assignmentUpdates, hasRole, handleAssignmentUpdate]);

  // Verify judge role access
  if (!hasRole(UserRole.JUDGE) && !hasRole(UserRole.SITE_ADMIN)) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-6 py-20 max-w-7xl">
          <Card className="bg-card/95 backdrop-blur-sm border-border/50 shadow-sm">
            <CardContent className="p-12 text-center">
              <div className="bg-warning-orange/10 rounded-full p-6 mb-4 inline-block">
                <Shield className="h-12 w-12 text-warning-orange" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Access Restricted</h2>
              <p className="text-muted-foreground max-w-sm mx-auto">
                This page is only accessible to users with judge permissions.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Use assignments state instead of todaysClasses const
  const todaysClasses = assignments;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-[#34C759]" />;
      case 'in-progress':
        return <Timer className="h-5 w-5 text-[#007AFF] animate-pulse" />;
      default:
        return <Circle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge className="bg-success-green/10 text-success-green border-success-green/20 border">
            Completed
          </Badge>
        );
      case 'in-progress':
        return (
          <Badge className="bg-primary/10 text-primary border-primary/20 border">
            In Progress
          </Badge>
        );
      default:
        return (
          <Badge className="bg-muted text-muted-foreground border-border border">
            Pending
          </Badge>
        );
    }
  };

  const handleStartJudging = async (judgeClass: JudgeClass) => {
    try {
      // Audit log the start of judging
      await auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'judge_class',
        entityId: judgeClass.id,
        changes: {
          status: { from: judgeClass.status, to: 'in-progress' }
        },
        metadata: {
          action: 'start_judging',
          classId: judgeClass.classId,
          judgeId: user?.id
        }
      });

      // Notify secretary via real-time system
      notificationService.publish({
        type: NotificationType.INFO,
        channel: 'role:secretary',
        sender: {
          id: user?.id || 'judge',
          name: user?.email || 'Judge',
          role: 'judge'
        },
        data: {
          type: 'judging_started',
          classId: judgeClass.classId,
          judgeId: user?.id,
          startedAt: new Date().toISOString()
        }
      });

      navigate(`/shows/${judgeClass.showId}/trials/${judgeClass.trialId}/classes/${judgeClass.classId}/judge`);
    } catch (error) {
      logger.error('Failed to start judging:', 'pages', {}, error as Error);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-20 max-w-7xl">
        <div className="space-y-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="space-y-2">
              <h1 className="text-4xl font-bold tracking-tight">
                Judge Dashboard
              </h1>
              <p className="text-muted-foreground text-lg">
                Manage your judging assignments
              </p>
            </div>
            <Button 
              variant="outline"
              className="border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 transition-all duration-200"
            >
              <Calendar className="h-4 w-4 mr-2" />
              View Schedule
            </Button>
          </div>

          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card className="bg-card/95 backdrop-blur-sm border-border/50 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Trophy className="h-4 w-4 text-primary" />
                  </div>
                  Today's Classes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">8</div>
                <p className="text-xs text-muted-foreground mt-1">3 completed</p>
              </CardContent>
            </Card>

            <Card className="bg-card/95 backdrop-blur-sm border-border/50 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Users className="h-4 w-4 text-primary" />
                  </div>
                  Total Entries
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">142</div>
                <p className="text-xs text-muted-foreground mt-1">57 judged</p>
              </CardContent>
            </Card>

            <Card className="bg-card/95 backdrop-blur-sm border-border/50 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <div className="p-2 bg-warning-orange/10 rounded-lg">
                    <Clock className="h-4 w-4 text-warning-orange" />
                  </div>
                  Next Class
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">30m</div>
                <p className="text-xs text-muted-foreground mt-1">Interior Novice A</p>
              </CardContent>
            </Card>

            <Card className="bg-card/95 backdrop-blur-sm border-border/50 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <div className="p-2 bg-success-green/10 rounded-lg">
                    <CheckCircle2 className="h-4 w-4 text-success-green" />
                  </div>
                  Completion Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">95%</div>
                <p className="text-xs text-success-green mt-1">On schedule</p>
              </CardContent>
            </Card>
          </div>

          {/* Classes List */}
          <Card className="bg-card/95 backdrop-blur-sm border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl font-semibold">Judging Assignments</CardTitle>
              <CardDescription>Your scheduled classes for judging</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-6">
                <TabsList className="grid w-full grid-cols-3 bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1">
                  <TabsTrigger 
                    value="today"
                    className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
                  >
                    Today
                  </TabsTrigger>
                  <TabsTrigger 
                    value="upcoming"
                    className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
                  >
                    Upcoming
                  </TabsTrigger>
                  <TabsTrigger 
                    value="completed"
                    className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
                  >
                    Completed
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="today" className="space-y-4">
                  {todaysClasses.map((judgeClass) => (
                    <div
                      key={judgeClass.id}
                      className="flex items-center justify-between p-4 border border-border/50 rounded-xl hover:bg-muted/20 hover:border-primary/20 transition-all duration-300 hover:shadow-sm"
                    >
                  <div className="flex items-center gap-4">
                    {getStatusIcon(judgeClass.status)}
                    <div>
                      <h3 className="font-semibold">{judgeClass.name}</h3>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                        <span>Ring {judgeClass.ringNumber}</span>
                        <span>•</span>
                        <span>{judgeClass.scheduledTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <span>•</span>
                        <span>{judgeClass.completedEntries}/{judgeClass.totalEntries} entries</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(judgeClass.status)}
                    {judgeClass.status !== 'completed' && (
                        <Button
                          size="sm"
                          onClick={() => handleStartJudging(judgeClass)}
                          className="bg-gradient-to-r from-primary to-[#5856D6] text-primary-foreground hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
                        >
                          {judgeClass.status === 'in-progress' ? 'Continue' : 'Start'} Judging
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                    )}
                  </div>
                </div>
              ))}
              
              {todaysClasses.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No classes scheduled for today
                </div>
              )}
            </TabsContent>

            <TabsContent value="upcoming" className="mt-4">
              <div className="text-center py-8 text-muted-foreground">
                No upcoming classes scheduled
              </div>
            </TabsContent>

            <TabsContent value="completed" className="mt-4">
              <div className="space-y-4">
                {todaysClasses
                  .filter(c => c.status === 'completed')
                  .map((judgeClass) => (
                    <div
                      key={judgeClass.id}
                      className="flex items-center justify-between p-4 border border-border/50 rounded-xl hover:bg-muted/20 transition-all duration-300"
                    >
                      <div className="flex items-center gap-4">
                        {getStatusIcon(judgeClass.status)}
                        <div>
                          <h3 className="font-semibold">{judgeClass.name}</h3>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                            <span>Ring {judgeClass.ringNumber}</span>
                            <span>•</span>
                            <span>{judgeClass.totalEntries} entries judged</span>
                          </div>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">
                        View Results
                      </Button>
                    </div>
                  ))}
              </div>
            </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="bg-card/95 backdrop-blur-sm border-border/50 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/20">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Timer className="h-5 w-5 text-primary" />
                  </div>
                  Timer Practice
                </CardTitle>
                <CardDescription>Practice with the timer system</CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  className="w-full border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 transition-all duration-200" 
                  variant="outline"
                >
                  <Timer className="h-4 w-4 mr-2" />
                  Open Timer Practice
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-card/95 backdrop-blur-sm border-border/50 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/20">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-3">
                  <div className="p-2 bg-warning-orange/10 rounded-lg">
                    <AlertCircle className="h-5 w-5 text-warning-orange" />
                  </div>
                  Quick Reference
                </CardTitle>
                <CardDescription>Judging guidelines and rules</CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  className="w-full border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 transition-all duration-200" 
                  variant="outline"
                >
                  <AlertCircle className="h-4 w-4 mr-2" />
                  View Guidelines
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-card/95 backdrop-blur-sm border-border/50 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/20">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-3">
                  <div className="p-2 bg-success-green/10 rounded-lg">
                    <Users className="h-5 w-5 text-success-green" />
                  </div>
                  Class Management
                </CardTitle>
                <CardDescription>Manage entries and check-in status within your classes</CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  className="w-full border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 transition-all duration-200" 
                  variant="outline"
                  disabled
                >
                  <Users className="h-4 w-4 mr-2" />
                  Integrated in Class View
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JudgeDashboard;