/**
 * ShowDashboard - Comprehensive show management dashboard
 * 
 * Central hub for all show management activities including:
 * - Show overview and statistics
 * - Quick access to management tools
 * - Real-time status monitoring
 * - Entry management
 * - Schedule overview
 * - Personnel assignments
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useShowStore } from '@/store/showStore';
import { useClassCreationStore } from '@/store/classCreationStore';
import { useEntryStore } from '@/store/entryStore';
import { CreatedClass } from '@/types/template.types';
import { UnifiedEntryData } from '@/types/unified-entry-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { usePagination, usePerformanceMetrics, useMemoryMonitoring } from '@/hooks/usePerformanceOptimization';
import { logger } from '@/services/LoggingService';
import {
  Calendar,
  Users,
  DollarSign,
  Settings,
  Clock,
  MapPin,
  AlertTriangle,
  CheckCircle,
  Edit,
  FileText,
  TrendingUp,
  Eye,
  Play,
  Pause,
  BarChart3
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { PERMISSIONS } from '@/types/auth-types';
import { useAuthContext } from '@/hooks/useAuthContext';

export interface ShowDashboardProps {
  showId?: string;
  className?: string;
}

interface ShowStats {
  totalEntries: number;
  confirmedEntries: number;
  pendingEntries: number;
  totalRevenue: number;
  totalClasses: number;
  completedClasses: number;
  inProgressClasses: number;
  pendingClasses: number;
  judgesAssigned: number;
  totalJudgesNeeded: number;
  stewardsAssigned: number;
  conflictsDetected: number;
  showProgress: number;
}

interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  variant: 'default' | 'outline' | 'secondary';
  urgent?: boolean;
  permission?: string;
}

export function ShowDashboard({ showId, className }: ShowDashboardProps) {
  const params = useParams();
  const navigate = useNavigate();
  const currentShowId = showId || params.showId;
  
  const { getShowById } = useShowStore();
  const { getClassesByTrial } = useClassCreationStore();
  const { getEntriesByShow } = useEntryStore();
  const { hasPermission } = useAuthContext();
  
  const [activeTab, setActiveTab] = useState('overview');
  const [refreshing, setRefreshing] = useState(false);
  
  // Performance monitoring
  const { summary: performanceSummary } = usePerformanceMetrics();
  const memoryInfo = useMemoryMonitoring();

  const show = currentShowId ? getShowById(currentShowId) : null;

  // Get show data with performance optimization
  const showClasses = useMemo(() => {
    return currentShowId && show?.trials?.[0] ? getClassesByTrial(show.trials[0].id) : [];
  }, [currentShowId, show?.trials, getClassesByTrial]);
  
  const showEntries = useMemo(() => {
    return currentShowId ? getEntriesByShow(currentShowId) : [];
  }, [currentShowId, getEntriesByShow]);

  // Paginated entries for better performance
  const entriesPagination = usePagination({
    data: showEntries,
    page: 1,
    pageSize: 50, // Show first 50 entries in overview
    sortBy: 'createdAt',
    sortDirection: 'desc'
  });

  // Calculate show statistics with memoization
  const stats: ShowStats = useMemo(() => {
    const totalEntries = showEntries.length;
    const confirmedEntries = showEntries.filter(e => e.status === 'confirmed' || e.status === 'paid').length;
    const pendingEntries = showEntries.filter(e => e.status === 'submitted').length;
    
    const totalRevenue = showEntries
      .filter(e => e.status === 'paid' || e.status === 'confirmed')
      .reduce((sum, entry) => sum + (entry.registrationData.entryFee || 0), 0);
    
    const totalClasses = showClasses.length;
    const completedClasses = showClasses.filter((c: CreatedClass) => c.status === 'Completed').length;
    const inProgressClasses = showClasses.filter((c: CreatedClass) => c.status === 'In Progress').length;
    const pendingClasses = showClasses.filter((c: CreatedClass) => c.status === 'Scheduled' || c.status === 'Upcoming').length;
    
    const judgesAssigned = showClasses.filter((c: CreatedClass) => c.personnel.judgeId).length;
    const totalJudgesNeeded = totalClasses;
    
    const stewardsAssigned = showClasses.filter((c: CreatedClass) => 
      Object.values(c.personnel.stewards).some(steward => steward)
    ).length;
    
    // Mock conflict detection - in real app this would come from conflict service
    const conflictsDetected = Math.floor(Math.random() * 3);
    
    const showProgress = totalClasses > 0 ? Math.round((completedClasses / totalClasses) * 100) : 0;

    return {
      totalEntries,
      confirmedEntries,
      pendingEntries,
      totalRevenue,
      totalClasses,
      completedClasses,
      inProgressClasses,
      pendingClasses,
      judgesAssigned,
      totalJudgesNeeded,
      stewardsAssigned,
      conflictsDetected,
      showProgress
    };
  }, [showEntries, showClasses]);

  // Define quick actions based on show state and user permissions
  const quickActions: QuickAction[] = useMemo(() => {
    const allActions = [
      {
        id: 'manage-entries',
        title: 'Manage Entries',
        description: `${stats.totalEntries} entries, ${stats.pendingEntries} pending`,
        icon: Users,
        href: `/secretary/shows/${currentShowId}/entries`,
        variant: (stats.pendingEntries > 0 ? 'default' : 'outline') as 'default' | 'outline' | 'secondary',
        urgent: stats.pendingEntries > 5,
        permission: PERMISSIONS.SHOW_MANAGE_ENTRIES
      },
      {
        id: 'class-management',
        title: 'Class Management',
        description: `${stats.totalClasses} classes, ${stats.pendingClasses} pending setup`,
        icon: Settings,
        href: `/secretary/shows/${currentShowId}/classes`,
        variant: (stats.pendingClasses > 0 ? 'default' : 'outline') as 'default' | 'outline' | 'secondary',
        urgent: stats.pendingClasses > 0 && stats.totalEntries > 0,
        permission: PERMISSIONS.SHOW_MANAGE
      },
      {
        id: 'run-order',
        title: 'Run Order & Schedule',
        description: `${stats.judgesAssigned}/${stats.totalJudgesNeeded} judges assigned`,
        icon: Calendar,
        href: `/secretary/shows/${currentShowId}/run-order`,
        variant: (stats.judgesAssigned < stats.totalJudgesNeeded ? 'default' : 'outline') as 'default' | 'outline' | 'secondary',
        urgent: stats.conflictsDetected > 0,
        permission: PERMISSIONS.SECRETARY_ASSIGN_JUDGES
      },
      {
        id: 'reports',
        title: 'Reports & Export',
        description: 'Generate show reports and export data',
        icon: FileText,
        href: `/secretary/shows/${currentShowId}/reports`,
        variant: 'outline' as 'default' | 'outline' | 'secondary',
        permission: PERMISSIONS.SHOW_READ
      },
      {
        id: 'live-scoring',
        title: 'Live Scoring',
        description: 'Judge scoring interface',
        icon: Play,
        href: `/judge/shows/${currentShowId}/scoring`,
        variant: (stats.inProgressClasses > 0 ? 'default' : 'secondary') as 'default' | 'outline' | 'secondary',
        permission: PERMISSIONS.JUDGE_ENTER_RESULTS
      },
      {
        id: 'show-settings',
        title: 'Show Settings',
        description: 'Edit show details and configuration',
        icon: Edit,
        href: `/secretary/shows/${currentShowId}/edit`,
        variant: 'outline' as 'default' | 'outline' | 'secondary',
        permission: PERMISSIONS.SHOW_UPDATE
      }
    ];

    // Filter actions based on user permissions
    return allActions.filter(action => hasPermission(action.permission));
  }, [currentShowId, stats, hasPermission]);

  // Handle refresh with performance monitoring
  const handleRefresh = useCallback(async () => {
    const startTime = performance.now();
    setRefreshing(true);
    
    try {
      // Simulate refresh delay - in real app this would refresh data from API
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Log performance metric
      const refreshTime = performance.now() - startTime;
      logger.debug(`Dashboard refresh completed in ${refreshTime.toFixed(2)}ms`, 'shows', {});
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Handle quick navigation
  const handleQuickAction = (action: QuickAction) => {
    navigate(action.href);
  };

  if (!show) {
    return (
      <div className={cn("flex items-center justify-center min-h-96", className)}>
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Show not found. Please check the show ID or return to the shows list.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{show.name}</h1>
          <div className="flex items-center gap-4 mt-2 text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {show.startDate} - {show.endDate}
            </div>
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {show.location}
            </div>
            <Badge variant={show.status === 'published' ? 'default' : 'secondary'}>
              {show.status}
            </Badge>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
            <TrendingUp className="h-4 w-4 mr-2" />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Button onClick={() => navigate(`/secretary/shows/${currentShowId}/live`)}>
            <Eye className="h-4 w-4 mr-2" />
            Live View
          </Button>
          {/* Performance indicator for development */}
          {process.env.NODE_ENV === 'development' && (
            <Badge variant="outline" className="text-xs">
              Render: {performanceSummary.avgRenderTime.toFixed(1)}ms
              {memoryInfo && (
                <span className="ml-1">
                  | Mem: {(memoryInfo.usedJSHeapSize / 1024 / 1024).toFixed(1)}MB
                </span>
              )}
            </Badge>
          )}
        </div>
      </div>

      {/* Key Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="flex items-center p-6">
            <Users className="h-8 w-8 text-blue-500 mr-4" />
            <div>
              <div className="text-2xl font-bold">{stats.totalEntries}</div>
              <div className="text-sm text-muted-foreground">Total Entries</div>
              <div className="text-xs text-green-600">
                {stats.confirmedEntries} confirmed • {stats.pendingEntries} pending
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center p-6">
            <DollarSign className="h-8 w-8 text-green-500 mr-4" />
            <div>
              <div className="text-2xl font-bold">{formatCurrency(stats.totalRevenue)}</div>
              <div className="text-sm text-muted-foreground">Revenue</div>
              <div className="text-xs text-muted-foreground">
                Avg: {stats.confirmedEntries > 0 ? formatCurrency(stats.totalRevenue / stats.confirmedEntries) : '$0'} per entry
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center p-6">
            <Settings className="h-8 w-8 text-purple-500 mr-4" />
            <div>
              <div className="text-2xl font-bold">{stats.totalClasses}</div>
              <div className="text-sm text-muted-foreground">Classes</div>
              <div className="text-xs text-blue-600">
                {stats.completedClasses} complete • {stats.inProgressClasses} active
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center p-6">
            <Clock className="h-8 w-8 text-orange-500 mr-4" />
            <div>
              <div className="text-2xl font-bold">{stats.showProgress}%</div>
              <div className="text-sm text-muted-foreground">Progress</div>
              <Progress value={stats.showProgress} className="w-16 h-2 mt-1" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts and Status */}
      {stats.conflictsDetected > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {stats.conflictsDetected} scheduling conflict{stats.conflictsDetected !== 1 ? 's' : ''} detected. 
            <Button variant="link" className="p-0 h-auto ml-2" onClick={() => navigate(`/secretary/shows/${currentShowId}/run-order`)}>
              Resolve now
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {quickActions.map((action) => (
              <Card 
                key={action.id}
                className={cn(
                  "cursor-pointer transition-all hover:shadow-md",
                  action.urgent && "ring-2 ring-orange-200 bg-orange-50"
                )}
                onClick={() => handleQuickAction(action)}
              >
                <CardContent className="flex items-start p-4">
                  <action.icon className={cn(
                    "h-6 w-6 mr-3 mt-0.5",
                    action.urgent ? "text-orange-600" : "text-muted-foreground"
                  )} />
                  <div className="flex-1">
                    <div className="font-medium flex items-center gap-2">
                      {action.title}
                      {action.urgent && (
                        <Badge variant="destructive" className="text-xs">
                          Urgent
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {action.description}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Detailed Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1">
          <TabsTrigger 
            value="overview"
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            Overview
          </TabsTrigger>
          <TabsTrigger 
            value="entries"
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            Entries
          </TabsTrigger>
          <TabsTrigger 
            value="schedule"
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            Schedule
          </TabsTrigger>
          <TabsTrigger 
            value="analytics"
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Entry Status Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Entry Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      Confirmed Entries
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{stats.confirmedEntries}</div>
                      <div className="text-xs text-muted-foreground">
                        {stats.totalEntries > 0 ? Math.round((stats.confirmedEntries / stats.totalEntries) * 100) : 0}%
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-orange-500" />
                      Pending Entries
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{stats.pendingEntries}</div>
                      <div className="text-xs text-muted-foreground">
                        {stats.totalEntries > 0 ? Math.round((stats.pendingEntries / stats.totalEntries) * 100) : 0}%
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Class Status Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Class Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      Completed Classes
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{stats.completedClasses}</div>
                      <div className="text-xs text-muted-foreground">
                        {stats.totalClasses > 0 ? Math.round((stats.completedClasses / stats.totalClasses) * 100) : 0}%
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Play className="h-4 w-4 text-blue-500" />
                      In Progress
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{stats.inProgressClasses}</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Pause className="h-4 w-4 text-gray-500" />
                      Pending Setup
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{stats.pendingClasses}</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="entries" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Recent Entries</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {entriesPagination.totalItems} total
                  </Badge>
                  <Badge variant="secondary">
                    Page {entriesPagination.page} of {entriesPagination.totalPages}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {entriesPagination.loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  <p className="mt-2 text-muted-foreground">Loading entries...</p>
                </div>
              ) : entriesPagination.result?.data.length ? (
                <div className="space-y-4">
                  <div className="grid gap-2">
                    {(entriesPagination.result.data as UnifiedEntryData[]).slice(0, 10).map((entry, index) => (
                      <div key={entry.id || index} className="flex items-center justify-between p-2 border rounded">
                        <div>
                          <div className="font-medium">{entry.dog || 'Unknown Dog'}</div>
                          <div className="text-sm text-muted-foreground">
                            Class {entry.classId} • {entry.handler || 'Unknown Handler'}
                          </div>
                        </div>
                        <Badge variant={entry.status === 'Qualified' ? 'default' : 'secondary'}>
                          {entry.status || 'Pending'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                  
                  {entriesPagination.totalItems > 10 && (
                    <div className="text-center pt-4">
                      <Button 
                        variant="outline" 
                        onClick={() => navigate(`/secretary/shows/${currentShowId}/entries`)}
                      >
                        View All {entriesPagination.totalItems} Entries
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No entries found for this show.</p>
                  <Button className="mt-4" onClick={() => navigate(`/secretary/shows/${currentShowId}/entries`)}>
                    Open Entry Management
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Schedule Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Schedule visualization would be integrated here.</p>
                <Button className="mt-4" onClick={() => navigate(`/secretary/shows/${currentShowId}/run-order`)}>
                  Open Schedule Management
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Show Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Analytics and reporting charts would be integrated here.</p>
                <Button className="mt-4" onClick={() => navigate(`/secretary/shows/${currentShowId}/reports`)}>
                  Open Reports
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default ShowDashboard;