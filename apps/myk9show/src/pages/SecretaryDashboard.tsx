import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Settings, Calendar, Plus, Copy, Bell, Activity } from 'lucide-react';
import { ShowCloneDialog } from '@/components/shows/cloning';
import { TipBanner } from '@/components/common/TipBanner';
import { useMilestones } from '@/hooks/useMilestones';
// Extracted modules
import {
  useSecretaryDashboardData,
  StatisticsCards,
  TrialManagementTabs,
  QuickActionsSection,
  RecentActivitySection,
  type TrialOverview,
} from './SecretaryDashboard/index';

const SecretaryDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [selectedTab, setSelectedTab] = useState('active');
  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [hasNewActivity] = useState(false);

  // Get data from extracted hook
  const { shows, allTrials, activeTrials, upcomingTrials, completedTrials, statistics } =
    useSecretaryDashboardData();
  const { activeTip, dismiss: dismissTip } = useMilestones();

  const handleManageTrial = (trial: TrialOverview) => {
    navigate(`/shows/${trial.showId}/trials/${trial.id}`);
  };

  const handleCreateShow = () => {
    navigate('/secretary/create-show/wizard');
  };

  return (
    <div className="p-6">
      <div className="space-y-8">
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
            <Button onClick={handleCreateShow}>
              <Plus className="h-4 w-4 mr-2" />
              Create New Show
            </Button>
            <Button
              variant="outline"
              className="hidden sm:flex hover:-translate-y-0.5 transition-all duration-300"
            >
              <Calendar className="h-4 w-4 mr-2" />
              Schedule
            </Button>
            <Button
              variant="outline"
              className="hidden sm:flex hover:-translate-y-0.5 transition-all duration-300"
            >
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </div>
        </div>

        {/* Progressive Tip Banner */}
        {activeTip && <TipBanner tip={activeTip} onDismiss={dismissTip} />}

        {/* Statistics Cards */}
        <StatisticsCards statistics={statistics} totalTrialsCount={allTrials.length} />

        {/* Trials Management */}
        <TrialManagementTabs
          selectedTab={selectedTab}
          onTabChange={setSelectedTab}
          activeTrials={activeTrials}
          upcomingTrials={upcomingTrials}
          completedTrials={completedTrials}
          onManageTrial={handleManageTrial}
          onCreateShow={handleCreateShow}
        />

        {/* Quick Actions */}
        <QuickActionsSection
          statistics={statistics}
          activeTrials={activeTrials}
          completedTrialsCount={completedTrials.length}
          showsCount={shows.length}
        />

        {/* Recent Activity */}
        <RecentActivitySection hasTrials={allTrials.length > 0} />

        {/* Show Clone Dialog */}
        <ShowCloneDialog open={showCloneDialog} onOpenChange={setShowCloneDialog} />
      </div>
    </div>
  );
};

export default SecretaryDashboard;
