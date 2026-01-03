import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { 
  ClipboardList, 
  FileText, 
  Users, 
  TrendingUp,
  Download,
  Settings,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Clock,
  Plus,
  Copy,
  BarChart3,
  Target,
  Timer,
  Bell,
  Zap,
  ChevronRight,
  PlayCircle,
  Activity,
  FolderOpen
} from 'lucide-react';
import { ShowCreationWizard } from '@/components/shows/wizard';
import { ShowCloneDialog } from '@/components/shows/cloning';
import { SecretaryLayout } from '@/components/secretary/SecretaryLayout';
import { useShowStore } from '@/store/showStore';
import { format } from 'date-fns';

interface TrialOverview {
  id: string;
  showId: string;
  name: string;
  date: Date;
  totalClasses: number;
  completedClasses: number;
  totalEntries: number;
  processedEntries: number;
  status: 'upcoming' | 'active' | 'completed';
}

const SecretaryDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [selectedTab, setSelectedTab] = useState('active');
  const [showWizard, setShowWizard] = useState(false);
  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [hasNewActivity] = useState(false); // TODO: Implement real activity detection
  
  // Get real data from the show store
  const { shows } = useShowStore();
  
  // Transform shows data into trials format
  const allTrials = useMemo(() => {
    const trials: TrialOverview[] = [];
    
    shows.forEach(show => {
      if (show.trials && show.trials.length > 0) {
        show.trials.forEach(trial => {
          trials.push({
            id: trial.id,
            showId: show.id,
            name: trial.name,
            date: new Date(trial.date),
            totalClasses: 0, // TODO: Get from actual classes data
            completedClasses: 0, // TODO: Calculate from completed classes
            totalEntries: 0, // TODO: Calculate from entries
            processedEntries: 0, // TODO: Calculate from processed entries
            status: trial.status as 'upcoming' | 'active' | 'completed'
          });
        });
      } else {
        // If no trials, use the show itself as a single trial
        const showDate = new Date(show.startDate);
        const now = new Date();
        let status: 'upcoming' | 'active' | 'completed' = 'upcoming';
        
        if (showDate < now && new Date(show.endDate) > now) {
          status = 'active';
        } else if (new Date(show.endDate) < now) {
          status = 'completed';
        }
        
        trials.push({
          id: show.id,
          showId: show.id,
          name: show.name,
          date: showDate,
          totalClasses: 0, // TODO: Get from actual classes
          completedClasses: 0,
          totalEntries: 0,
          processedEntries: 0,
          status
        });
      }
    });
    
    return trials;
  }, [shows]);
  
  // Calculate real statistics
  const statistics = useMemo(() => {
    const activeTrialsCount = allTrials.filter(t => t.status === 'active').length;
    const totalEntries = allTrials.reduce((sum, trial) => sum + trial.totalEntries, 0);
    const processedEntries = allTrials.reduce((sum, trial) => sum + trial.processedEntries, 0);
    const resultsPublished = totalEntries > 0 
      ? Math.round((processedEntries / totalEntries) * 100) 
      : 0;
    
    // Calculate average processing time (mock for now)
    const avgProcessing = activeTrialsCount > 0 ? 12 : 0;
    
    return {
      activeTrials: activeTrialsCount,
      totalEntries,
      resultsPublished,
      avgProcessing
    };
  }, [allTrials]);

  // Filter trials by status for tabs
  const activeTrials = useMemo(() => 
    allTrials.filter(t => t.status === 'active'), 
    [allTrials]
  );
  
  const upcomingTrials = useMemo(() => 
    allTrials.filter(t => t.status === 'upcoming'), 
    [allTrials]
  );
  
  const completedTrials = useMemo(() => 
    allTrials.filter(t => t.status === 'completed'), 
    [allTrials]
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-success-green/10 text-success-green border-success-green/20">Completed</Badge>;
      case 'active':
        return <Badge className="bg-primary/10 text-primary border-primary/20">Active</Badge>;
      default:
        return <Badge className="bg-muted text-muted-foreground border-border">Upcoming</Badge>;
    }
  };

  const handleManageTrial = (trial: TrialOverview) => {
    navigate(`/shows/${trial.showId}/trials/${trial.id}`);
  };

  return (
    <SecretaryLayout>
      <div className="space-y-8 pt-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Avatar className="h-12 w-12 border-2 border-primary/20">
                  <AvatarFallback className="bg-gradient-to-br from-primary/20 to-secondary/20 text-primary font-semibold text-lg">
                    SC
                  </AvatarFallback>
                </Avatar>
                <div className="absolute -top-1 -right-1 h-4 w-4 bg-success-green rounded-full border-2 border-background flex items-center justify-center">
                  <div className="h-2 w-2 bg-white rounded-full" />
                </div>
              </div>
              <div>
                <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                  Secretary Dashboard
                </h1>
                <p className="text-muted-foreground text-lg font-medium">
                  Welcome back, Sarah • Managing trials and results
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="flex items-center gap-1 px-2 py-1 bg-success-green/10 text-success-green rounded-full">
                <Activity className="h-3 w-3" />
                <span className="font-medium">Live</span>
              </div>
              <span className="text-muted-foreground">Last updated 2 minutes ago</span>
              {hasNewActivity && (
                <div className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-full animate-pulse">
                  <Bell className="h-3 w-3" />
                  <span className="font-medium text-xs">New activity</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <Button 
              onClick={() => setShowCloneDialog(true)} 
              variant="outline" 
              className="border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300 shadow-sm"
            >
              <Copy className="h-4 w-4 mr-2" />
              Clone Show
            </Button>
            <Button 
              onClick={() => setShowWizard(true)}
              className="bg-gradient-to-r from-primary to-secondary text-primary-foreground hover:shadow-xl hover:-translate-y-1 hover:scale-[1.02] transition-all duration-300 shadow-sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create New Show
            </Button>
            <Button variant="outline" className="hidden sm:flex hover:-translate-y-0.5 transition-all duration-300">
              <Calendar className="h-4 w-4 mr-2" />
              Schedule
            </Button>
            <Button variant="outline" className="hidden sm:flex hover:-translate-y-0.5 transition-all duration-300">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-sm hover:-translate-y-2 group">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <CardHeader className="pb-4 relative">
              <CardTitle className="text-sm font-semibold flex items-center justify-between text-muted-foreground">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl shadow-sm group-hover:shadow-md transition-all duration-300">
                    <ClipboardList className="h-5 w-5 text-primary" />
                  </div>
                  Active Trials
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 relative">
              <div className="text-4xl font-bold mb-2 bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                {statistics.activeTrials}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground font-medium">
                  {statistics.activeTrials > 0 ? `${statistics.activeTrials} in progress` : 'No active trials'}
                </p>
                {statistics.activeTrials > 0 && (
                  <div className="flex items-center gap-1">
                    <div className="h-2 w-2 bg-success-green rounded-full animate-pulse" />
                    <span className="text-xs text-success-green font-medium">Live</span>
                  </div>
                )}
              </div>
              {statistics.activeTrials > 0 && (
                <Progress value={(statistics.activeTrials / allTrials.length) * 100} className="mt-3 h-1" />
              )}
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-md hover:-translate-y-2 group">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <CardHeader className="pb-4 relative">
              <CardTitle className="text-sm font-semibold flex items-center justify-between text-muted-foreground">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gradient-to-br from-blue-500/20 to-blue-500/10 rounded-xl shadow-sm group-hover:shadow-md transition-all duration-300">
                    <Users className="h-5 w-5 text-blue-500" />
                  </div>
                  Total Entries
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 relative">
              <div className="text-4xl font-bold mb-2 bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                {statistics.totalEntries}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground font-medium">
                  {statistics.totalEntries > 0 
                    ? `${statistics.totalEntries} total entries` 
                    : 'No entries yet'}
                </p>
                {statistics.totalEntries > 0 && (
                  <div className="flex items-center gap-1">
                    <BarChart3 className="h-3 w-3 text-blue-500" />
                    <span className="text-xs text-blue-500 font-medium">Active</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-md hover:-translate-y-2 group">
            <div className="absolute inset-0 bg-gradient-to-br from-success-green/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <CardHeader className="pb-4 relative">
              <CardTitle className="text-sm font-semibold flex items-center justify-between text-muted-foreground">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gradient-to-br from-success-green/20 to-success-green/10 rounded-xl shadow-sm group-hover:shadow-md transition-all duration-300">
                    <Target className="h-5 w-5 text-success-green" />
                  </div>
                  Results Published
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 relative">
              <div className="text-4xl font-bold mb-2 bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                {statistics.resultsPublished}%
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground font-medium">
                  {statistics.totalEntries > 0 
                    ? `${statistics.resultsPublished}% completed` 
                    : 'No results to publish'}
                </p>
                {statistics.resultsPublished > 0 && (
                  <div className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-success-green" />
                    <span className="text-xs text-success-green font-medium">Processing</span>
                  </div>
                )}
              </div>
              {statistics.totalEntries > 0 && (
                <Progress value={statistics.resultsPublished} className="mt-3 h-1" />
              )}
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-md hover:-translate-y-2 group">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <CardHeader className="pb-4 relative">
              <CardTitle className="text-sm font-semibold flex items-center justify-between text-muted-foreground">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gradient-to-br from-purple-500/20 to-purple-500/10 rounded-xl shadow-sm group-hover:shadow-md transition-all duration-300">
                    <Timer className="h-5 w-5 text-purple-500" />
                  </div>
                  Avg. Processing
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 relative">
              <div className="text-4xl font-bold mb-2 bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                {statistics.avgProcessing}m
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground font-medium">
                  {statistics.avgProcessing > 0 
                    ? 'Per class average' 
                    : 'No data available'}
                </p>
                {statistics.avgProcessing > 0 && (
                  <div className="flex items-center gap-1">
                    <Zap className="h-3 w-3 text-purple-500" />
                    <span className="text-xs text-purple-500 font-medium">Tracking</span>
                  </div>
                )}
              </div>
              {statistics.avgProcessing > 0 && (
                <div className="mt-3 flex gap-1">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className={`h-1 flex-1 rounded-full ${
                      i < Math.round(statistics.avgProcessing / 5) ? 'bg-success-green' : 'bg-muted'
                    }`} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Trials Management */}
        <Card className="bg-card border border-border rounded-xl shadow-sm backdrop-blur-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-semibold">Trial Management</CardTitle>
            <CardDescription className="text-muted-foreground">
              Overview of trials requiring secretary management
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <Tabs value={selectedTab} onValueChange={setSelectedTab}>
              <TabsList className="grid w-full grid-cols-3 bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1">
                <TabsTrigger 
                  value="active" 
                  className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
                >
                  Active
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

            <TabsContent value="active" className="space-y-6 mt-6">
              {activeTrials.map((trial) => {
                  const progressPercentage = (trial.completedClasses / trial.totalClasses) * 100;
                  const entriesProgressPercentage = (trial.processedEntries / trial.totalEntries) * 100;
                  
                  return (
                    <div
                      key={trial.id}
                      className="group relative overflow-hidden p-8 border border-border rounded-2xl bg-gradient-to-r from-card to-card/80 hover:from-card/95 hover:to-card/90 transition-all duration-500 hover:shadow-xl hover:-translate-y-1"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      
                      <div className="relative flex items-center justify-between">
                        <div className="flex-grow space-y-6">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors duration-300">
                              <PlayCircle className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <h3 className="font-bold text-xl text-foreground group-hover:text-primary transition-colors duration-300">
                                {trial.name}
                              </h3>
                              <div className="flex items-center gap-2 mt-1">
                                {getStatusBadge(trial.status)}
                                <span className="text-sm text-muted-foreground">
                                  Started {trial.date.toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                <ClipboardList className="h-4 w-4 text-muted-foreground" />
                                <p className="text-sm font-medium text-muted-foreground">Classes Progress</p>
                              </div>
                              <div>
                                <p className="text-2xl font-bold">{trial.completedClasses}<span className="text-lg text-muted-foreground">/{trial.totalClasses}</span></p>
                                <Progress value={progressPercentage} className="mt-2 h-2" />
                                <p className="text-xs text-muted-foreground mt-1">{Math.round(progressPercentage)}% complete</p>
                              </div>
                            </div>
                            
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                <Users className="h-4 w-4 text-muted-foreground" />
                                <p className="text-sm font-medium text-muted-foreground">Entry Processing</p>
                              </div>
                              <div>
                                <p className="text-2xl font-bold">{trial.processedEntries}<span className="text-lg text-muted-foreground">/{trial.totalEntries}</span></p>
                                <Progress value={entriesProgressPercentage} className="mt-2 h-2" />
                                <p className="text-xs text-muted-foreground mt-1">{Math.round(entriesProgressPercentage)}% processed</p>
                              </div>
                            </div>
                            
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                <Target className="h-4 w-4 text-muted-foreground" />
                                <p className="text-sm font-medium text-muted-foreground">Efficiency</p>
                              </div>
                              <div>
                                <p className="text-2xl font-bold text-success-green">94%</p>
                                <div className="flex items-center gap-1 mt-1">
                                  <TrendingUp className="h-3 w-3 text-success-green" />
                                  <span className="text-xs text-success-green font-medium">+12%</span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                <Timer className="h-4 w-4 text-muted-foreground" />
                                <p className="text-sm font-medium text-muted-foreground">Time Remaining</p>
                              </div>
                              <div>
                                <p className="text-2xl font-bold">2.5h</p>
                                <p className="text-xs text-muted-foreground mt-1">Estimated completion</p>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="ml-8 flex flex-col gap-3">
                          <Button 
                            onClick={() => handleManageTrial(trial)}
                            className="bg-gradient-to-r from-primary to-secondary text-primary-foreground hover:shadow-xl hover:-translate-y-1 hover:scale-105 transition-all duration-300 px-6 py-3 text-base font-semibold"
                          >
                            Manage Trial
                            <ChevronRight className="h-5 w-5 ml-2" />
                          </Button>
                          <Button 
                            variant="outline"
                            className="border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300"
                          >
                            Quick Actions
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              
              {activeTrials.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="bg-muted/50 rounded-full p-6 mb-4">
                    <FolderOpen className="h-12 w-12 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No Active Trials</h3>
                  <p className="text-muted-foreground mb-6 max-w-sm text-center">
                    You don't have any active trials at the moment. Create a new show to get started.
                  </p>
                  <Button 
                    onClick={() => setShowWizard(true)}
                    className="bg-gradient-to-r from-primary to-secondary text-primary-foreground hover:shadow-lg"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create New Show
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="upcoming" className="space-y-6 mt-6">
              {upcomingTrials.map((trial) => (
                  <div
                    key={trial.id}
                    className="group relative overflow-hidden p-6 border border-border rounded-2xl bg-gradient-to-r from-card to-card/80 hover:from-card/95 hover:to-card/90 transition-all duration-500 hover:shadow-sm hover:-translate-y-1"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    
                    <div className="relative flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-500/10 rounded-xl group-hover:bg-blue-500/20 transition-colors duration-300">
                          <Calendar className="h-6 w-6 text-blue-500" />
                        </div>
                        <div>
                          <h3 className="font-bold text-lg text-foreground group-hover:text-blue-600 transition-colors duration-300">
                            {trial.name}
                          </h3>
                          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              <span>Starts {trial.date.toLocaleDateString()}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Users className="h-4 w-4" />
                              <span>{trial.totalEntries} entries registered</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <ClipboardList className="h-4 w-4" />
                              <span>{trial.totalClasses} classes scheduled</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-3">
                            {getStatusBadge(trial.status)}
                            <div className="flex items-center gap-1 px-2 py-1 bg-blue-500/10 text-blue-600 rounded-full text-xs font-medium">
                              <span>Ready for setup</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Button 
                          variant="outline" 
                          onClick={() => handleManageTrial(trial)}
                          className="border-blue-500/20 text-blue-600 hover:bg-blue-500/5 hover:border-blue-500/40 hover:-translate-y-0.5 transition-all duration-300"
                        >
                          <Settings className="h-4 w-4 mr-2" />
                          Prepare Trial
                        </Button>
                        <Button 
                          onClick={() => handleManageTrial(trial)}
                          className="bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:shadow-sm hover:-translate-y-0.5 transition-all duration-300"
                        >
                          Start Setup
                          <ChevronRight className="h-4 w-4 ml-2" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              
              {upcomingTrials.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="bg-muted/50 rounded-full p-6 mb-4">
                    <Calendar className="h-12 w-12 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No Upcoming Trials</h3>
                  <p className="text-muted-foreground mb-6 max-w-sm text-center">
                    You don't have any trials scheduled for the future. Schedule a new show to see it here.
                  </p>
                  <Button 
                    onClick={() => setShowWizard(true)}
                    className="bg-gradient-to-r from-primary to-secondary text-primary-foreground hover:shadow-lg"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create New Show
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="completed" className="space-y-6 mt-6">
              {completedTrials.map((trial) => (
                <div
                  key={trial.id}
                  className="group relative overflow-hidden p-6 border border-border rounded-2xl bg-gradient-to-r from-card to-card/80 hover:from-card/95 hover:to-card/90 transition-all duration-500 hover:shadow-sm hover:-translate-y-1"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-success-green/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  
                  <div className="relative flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-success-green/10 rounded-xl group-hover:bg-success-green/20 transition-colors duration-300">
                        <CheckCircle2 className="h-6 w-6 text-success-green" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg text-foreground group-hover:text-success-green transition-colors duration-300">
                          {trial.name}
                        </h3>
                        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                          <span>Completed on {format(trial.date, 'MMM d, yyyy')}</span>
                          <span>•</span>
                          <span>{trial.totalClasses} classes</span>
                          <span>•</span>
                          <span>{trial.totalEntries} entries</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <Button 
                        variant="outline"
                        className="border-success-green/20 text-success-green hover:bg-success-green/5 hover:border-success-green/40"
                      >
                        View Results
                      </Button>
                      <Button 
                        variant="outline"
                        className="border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40"
                      >
                        Export Report
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              
              {completedTrials.length === 0 && (
                <div className="text-center py-16">
                  <div className="mx-auto w-24 h-24 bg-gradient-to-br from-success-green/20 to-success-green/10 rounded-full flex items-center justify-center mb-6">
                    <CheckCircle2 className="h-12 w-12 text-success-green" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">All caught up!</h3>
                  <p className="text-muted-foreground mb-6">No completed trials to display at the moment.</p>
                  <Button 
                    onClick={() => setShowWizard(true)}
                    className="bg-gradient-to-r from-primary to-secondary text-primary-foreground hover:shadow-sm hover:-translate-y-0.5 transition-all duration-300"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create New Show
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-md hover:-translate-y-2">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <CardHeader className="pb-6 relative">
              <CardTitle className="text-xl font-bold flex items-center gap-4">
                <div className="p-4 bg-gradient-to-br from-primary/20 to-primary/10 rounded-2xl shadow-sm group-hover:shadow-xl group-hover:scale-110 transition-all duration-300">
                  <FileText className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <div className="text-foreground group-hover:text-primary transition-colors duration-300">Result Entry</div>
                  <div className="text-sm font-normal text-muted-foreground mt-1">Quick access to result entry forms</div>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="relative">
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Pending entries</span>
                  <Badge className="bg-primary/10 text-primary border-primary/20">
                    {statistics.totalEntries - statistics.resultsPublished || 0}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Active trials</span>
                  <span className="font-medium text-success-green">
                    {statistics.activeTrials || 0}
                  </span>
                </div>
              </div>
              <Button className="w-full mt-6 bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20 text-primary hover:bg-gradient-to-r hover:from-primary hover:to-secondary hover:text-white hover:shadow-sm hover:-translate-y-1 transition-all duration-300 font-semibold py-3" variant="outline">
                <FileText className="h-4 w-4 mr-2" />
                Enter Results
              </Button>
            </CardContent>
          </Card>

          <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-md hover:-translate-y-2 hover:border-blue-500/30">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <CardHeader className="pb-6 relative">
              <CardTitle className="text-xl font-bold flex items-center gap-4">
                <div className="p-4 bg-gradient-to-br from-blue-500/20 to-blue-500/10 rounded-2xl shadow-sm group-hover:shadow-xl group-hover:scale-110 transition-all duration-300">
                  <Download className="h-6 w-6 text-blue-500" />
                </div>
                <div>
                  <div className="text-foreground group-hover:text-blue-600 transition-colors duration-300">Export Reports</div>
                  <div className="text-sm font-normal text-muted-foreground mt-1">Generate and download reports</div>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="relative">
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Reports ready</span>
                  <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">
                    {completedTrials.length || 0}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total shows</span>
                  <span className="font-medium">{shows.length || 0}</span>
                </div>
              </div>
              <Button className="w-full mt-6 bg-gradient-to-r from-blue-500/10 to-blue-500/5 border-blue-500/20 text-blue-600 hover:bg-gradient-to-r hover:from-blue-500 hover:to-blue-600 hover:text-white hover:shadow-sm hover:-translate-y-1 transition-all duration-300 font-semibold py-3" variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export Data
              </Button>
            </CardContent>
          </Card>

          <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-md hover:-translate-y-2 hover:border-warning-orange/30">
            <div className="absolute inset-0 bg-gradient-to-br from-warning-orange/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <CardHeader className="pb-6 relative">
              <CardTitle className="text-xl font-bold flex items-center gap-4">
                <div className="p-4 bg-gradient-to-br from-warning-orange/20 to-warning-orange/10 rounded-2xl shadow-sm group-hover:shadow-xl group-hover:scale-110 transition-all duration-300 relative">
                  <AlertCircle className="h-6 w-6 text-warning-orange" />
                  <div className="absolute -top-1 -right-1 h-3 w-3 bg-error-red rounded-full animate-pulse" />
                </div>
                <div>
                  <div className="text-foreground group-hover:text-warning-orange transition-colors duration-300">Pending Actions</div>
                  <div className="text-sm font-normal text-muted-foreground mt-1">Items requiring immediate attention</div>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="relative">
              {activeTrials.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-warning-orange/5 rounded-lg border border-warning-orange/10">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 bg-warning-orange rounded-full" />
                      <span className="text-sm font-medium">Active trials</span>
                    </div>
                    <Badge className="bg-warning-orange/10 text-warning-orange border-warning-orange/20 font-bold">
                      {activeTrials.length}
                    </Badge>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">No pending actions</p>
                  <p className="text-xs text-muted-foreground mt-1">All trials are up to date</p>
                </div>
              )}
              <Button className="w-full mt-6 bg-gradient-to-r from-warning-orange/10 to-error-red/5 border-warning-orange/20 text-warning-orange hover:bg-gradient-to-r hover:from-warning-orange hover:to-error-red hover:text-white hover:shadow-sm hover:-translate-y-1 transition-all duration-300 font-semibold py-3" variant="outline">
                <AlertCircle className="h-4 w-4 mr-2" />
                View All Issues
              </Button>
            </CardContent>
          </Card>
      </div>

        {/* Recent Activity */}
        <Card className="relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-secondary to-primary" />
          <CardHeader className="pb-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl font-bold flex items-center gap-3">
                  <div className="p-3 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl">
                    <Activity className="h-6 w-6 text-primary" />
                  </div>
                  Recent Activity
                </CardTitle>
                <CardDescription className="text-muted-foreground mt-2 text-base">
                  Latest secretary actions and live updates
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 bg-success-green rounded-full animate-pulse" />
                <span className="text-sm font-medium text-success-green">Live feed</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8">
            {allTrials.length > 0 ? (
              <div className="space-y-6">
                {/* TODO: Implement real activity tracking
              <div className="group flex items-center gap-6 p-4 rounded-xl hover:bg-gradient-to-r hover:from-success-green/5 hover:to-transparent transition-all duration-300 hover:shadow-md border border-border">
                <div className="relative">
                  <div className="p-3 bg-gradient-to-br from-success-green/20 to-success-green/10 rounded-xl shadow-sm group-hover:shadow-xl group-hover:scale-110 transition-all duration-300">
                    <CheckCircle2 className="h-6 w-6 text-success-green" />
                  </div>
                  <div className="absolute -top-1 -right-1 h-3 w-3 bg-success-green rounded-full animate-ping" />
                </div>
                <div className="flex-grow">
                  <p className="text-base font-semibold text-foreground group-hover:text-success-green transition-colors duration-300">
                    Container Novice A - Results Published
                  </p>
                  <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      15 entries processed
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      5 minutes ago
                    </span>
                    <Badge className="bg-success-green/10 text-success-green border-success-green/20 text-xs">Completed</Badge>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-success-green transition-colors duration-300" />
              </div>
            
              <div className="group flex items-center gap-6 p-4 rounded-xl hover:bg-gradient-to-r hover:from-blue-500/5 hover:to-transparent transition-all duration-300 hover:shadow-md border border-border">
                <div className="relative">
                  <div className="p-3 bg-gradient-to-br from-blue-500/20 to-blue-500/10 rounded-xl shadow-sm group-hover:shadow-xl group-hover:scale-110 transition-all duration-300">
                    <Target className="h-6 w-6 text-blue-500" />
                  </div>
                </div>
                <div className="flex-grow">
                  <p className="text-base font-semibold text-foreground group-hover:text-blue-600 transition-colors duration-300">
                    Interior Excellent - Placements Calculated
                  </p>
                  <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <BarChart3 className="h-3 w-3" />
                      Top 4 determined
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      12 minutes ago
                    </span>
                    <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20 text-xs">Calculated</Badge>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-blue-500 transition-colors duration-300" />
              </div>
            
              <div className="group flex items-center gap-6 p-4 rounded-xl hover:bg-gradient-to-r hover:from-warning-orange/5 hover:to-transparent transition-all duration-300 hover:shadow-md border border-border">
                <div className="relative">
                  <div className="p-3 bg-gradient-to-br from-warning-orange/20 to-warning-orange/10 rounded-xl shadow-sm group-hover:shadow-xl group-hover:scale-110 transition-all duration-300">
                    <FileText className="h-6 w-6 text-warning-orange" />
                  </div>
                  <div className="absolute -top-1 -right-1 h-3 w-3 bg-warning-orange rounded-full animate-pulse" />
                </div>
                <div className="flex-grow">
                  <p className="text-base font-semibold text-foreground group-hover:text-warning-orange transition-colors duration-300">
                    Exterior Masters - Score Entry Started
                  </p>
                  <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      Judge: Jane Doe
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      25 minutes ago
                    </span>
                    <Badge className="bg-warning-orange/10 text-warning-orange border-warning-orange/20 text-xs">In Progress</Badge>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-warning-orange transition-colors duration-300" />
              </div>
              
              <div className="pt-4 border-t border-border/20">
                <Button 
                  variant="outline" 
                  className="w-full border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300 font-medium"
                >
                  <Activity className="h-4 w-4 mr-2" />
                  View All Activity
                </Button>
              </div>
          </div>
                */}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="bg-muted/50 rounded-full p-6 mb-4 mx-auto w-fit">
                  <Activity className="h-12 w-12 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground">No recent activity</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Activity will appear here once you create your first show
                </p>
              </div>
            )}
        </CardContent>
      </Card>

        {/* Show Creation Wizard */}
        <ShowCreationWizard
          open={showWizard}
          onOpenChange={setShowWizard}
        />

        {/* Show Clone Dialog */}
        <ShowCloneDialog
          open={showCloneDialog}
          onOpenChange={setShowCloneDialog}
        />
      </div>
    </SecretaryLayout>
  );
};

export default SecretaryDashboard;