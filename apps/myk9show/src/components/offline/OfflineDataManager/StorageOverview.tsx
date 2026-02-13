/**
 * StorageOverview - Displays storage quota usage and breakdown by entity type
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { HardDrive } from 'lucide-react';
import type { StorageQuota, StorageBreakdownItem } from './types';
import { formatFileSize } from './utils';

interface StorageOverviewProps {
  storageQuota: StorageQuota;
  storageBreakdown: StorageBreakdownItem[];
}

export function StorageOverview({ storageQuota, storageBreakdown }: StorageOverviewProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HardDrive className="h-5 w-5" />
          Storage Usage
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm">
              {formatFileSize(storageQuota.used)} of {formatFileSize(storageQuota.total)} used
            </span>
            <span className="text-sm text-muted-foreground">
              {storageQuota.usagePercentage}%
            </span>
          </div>
          <Progress value={storageQuota.usagePercentage} className="h-2" />
          <div className="text-xs text-muted-foreground">
            {formatFileSize(storageQuota.available)} available
          </div>
        </div>

        {/* Storage Breakdown */}
        <div className="space-y-3">
          <h4 className="font-medium">Storage by Type</h4>
          <div className="space-y-2">
            {storageBreakdown.map((item) => (
              <div key={item.entity} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: `hsl(${item.percentage * 3.6}, 70%, 50%)` }}
                  />
                  <span className="text-sm">{item.entity}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {formatFileSize(item.size)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({item.percentage}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
