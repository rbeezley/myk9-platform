import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, FileText, Activity, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type {
  DashboardStatistics,
  TrialOverview,
} from '@/pages/SecretaryDashboard/secretary-dashboard-types';

interface MissionControlSidebarProps {
  statistics: DashboardStatistics;
  activeTrials: TrialOverview[];
}

export const MissionControlSidebar: React.FC<MissionControlSidebarProps> = ({
  statistics,
  activeTrials,
}) => {
  const navigate = useNavigate();

  return (
    <div className="space-y-4 w-[320px] flex-shrink-0">
      {/* Alerts section */}
      {statistics.activeTrials > 0 && (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Needs Attention
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-2 text-sm">
              {statistics.totalEntries === 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">No entries yet</span>
                  <Badge variant="outline" className="text-xs">
                    Action needed
                  </Badge>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {activeTrials.length} active trial{activeTrials.length !== 1 ? 's' : ''} in
                progress
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sm gap-2"
            onClick={() => navigate('/secretary/entries')}
          >
            <FileText className="h-4 w-4" />
            Manage Entries
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sm gap-2"
            onClick={() => navigate('/secretary/day-of')}
          >
            <Activity className="h-4 w-4" />
            Day-of Operations
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sm gap-2"
            onClick={() => navigate('/secretary/waitlist')}
          >
            <ExternalLink className="h-4 w-4" />
            Waitlist
          </Button>
        </CardContent>
      </Card>

      {/* Recent Activity placeholder */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <p className="text-xs text-muted-foreground text-center py-4">
            Activity feed loads when viewing a specific trial
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
