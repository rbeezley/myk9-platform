/**
 * Recent activity section for SecretaryDashboard
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity } from 'lucide-react';

interface RecentActivitySectionProps {
  hasTrials: boolean;
}

export const RecentActivitySection: React.FC<RecentActivitySectionProps> = ({
  hasTrials,
}) => {
  return (
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
        {hasTrials ? (
          <div className="space-y-6">
            {/* Activity items will be rendered here when real activity tracking is implemented */}
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
  );
};
