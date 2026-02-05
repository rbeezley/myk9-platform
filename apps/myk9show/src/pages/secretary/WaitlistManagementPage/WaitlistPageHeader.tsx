/**
 * Page Header component for WaitlistManagementPage
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { ListOrdered, RefreshCw } from 'lucide-react';

interface WaitlistPageHeaderProps {
  onRefresh: () => void;
  isRefreshDisabled: boolean;
}

export const WaitlistPageHeader: React.FC<WaitlistPageHeaderProps> = ({
  onRefresh,
  isRefreshDisabled,
}) => {
  return (
    <div className="flex justify-between items-start">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <ListOrdered className="h-8 w-8" />
          Waitlist Management
        </h1>
        <p className="text-muted-foreground">
          Manage class waitlists, offer spots to exhibitors, and track capacity
        </p>
      </div>
      <Button variant="outline" onClick={onRefresh} disabled={isRefreshDisabled}>
        <RefreshCw className="h-4 w-4 mr-2" />
        Refresh
      </Button>
    </div>
  );
};
