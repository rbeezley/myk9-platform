import React, { useState, useEffect, useCallback } from 'react';
import { HardDrive, AlertTriangle, Info } from 'lucide-react';
import { Progress } from '../ui/progress';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

interface StorageInfo {
  used: number; // bytes
  available: number; // bytes
  total: number; // bytes
  percentage: number;
  breakdown: {
    dogs: number;
    people: number;
    shows: number;
    clubs: number;
    cache: number;
    other: number;
  };
}

interface StorageUsageMonitorProps {
  showBreakdown?: boolean;
  warningThreshold?: number; // percentage
  criticalThreshold?: number; // percentage
  onCleanupNeeded?: () => void;
  className?: string;
}

export const StorageUsageMonitor: React.FC<StorageUsageMonitorProps> = ({
  showBreakdown = false,
  warningThreshold = 80,
  criticalThreshold = 95,
  onCleanupNeeded,
  className = ''
}) => {
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const calculateStorageUsage = useCallback(async (): Promise<StorageInfo> => {
    try {
      // Check if Storage API is available
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        const total = estimate.quota || 0;
        const used = estimate.usage || 0;
        const available = total - used;
        const percentage = total > 0 ? (used / total) * 100 : 0;

        // Calculate breakdown by examining localStorage
        const breakdown = {
          dogs: getLocalStorageSize('dog-store') + getLocalStorageSize('dogs-'),
          people: getLocalStorageSize('people-store') + getLocalStorageSize('people-'),
          shows: getLocalStorageSize('show-store') + getLocalStorageSize('shows-'),
          clubs: getLocalStorageSize('club-store') + getLocalStorageSize('clubs-'),
          cache: getLocalStorageSize('cache-') + getLocalStorageSize('query-'),
          other: 0
        };

        // Calculate other storage
        const totalBreakdown = Object.values(breakdown).reduce((sum, val) => sum + val, 0);
        breakdown.other = Math.max(0, used - totalBreakdown);

        return {
          used,
          available,
          total,
          percentage,
          breakdown
        };
      } else {
        // Fallback: estimate based on localStorage size
        const localStorageSize = getLocalStorageTotalSize();
        const estimatedTotal = 50 * 1024 * 1024; // Estimate 50MB total for localStorage
        const percentage = (localStorageSize / estimatedTotal) * 100;

        return {
          used: localStorageSize,
          available: estimatedTotal - localStorageSize,
          total: estimatedTotal,
          percentage: Math.min(percentage, 100),
          breakdown: {
            dogs: getLocalStorageSize('dog-store'),
            people: getLocalStorageSize('people-store'),
            shows: getLocalStorageSize('show-store'),
            clubs: getLocalStorageSize('club-store'),
            cache: getLocalStorageSize('cache-'),
            other: 0
          }
        };
      }
    } catch (error) {
      console.error('Failed to calculate storage usage:', error);
      throw error;
    }
  }, []);

  const getLocalStorageSize = (prefix: string): number => {
    let size = 0;
    for (const key in localStorage) {
      if (key.startsWith(prefix)) {
        size += localStorage.getItem(key)?.length || 0;
      }
    }
    return size * 2; // Approximate bytes (UTF-16)
  };

  const getLocalStorageTotalSize = (): number => {
    let size = 0;
    for (const key in localStorage) {
      size += key.length + (localStorage.getItem(key)?.length || 0);
    }
    return size * 2; // Approximate bytes (UTF-16)
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const getStatusColor = () => {
    if (!storageInfo) return 'text-muted-foreground';
    if (storageInfo.percentage >= criticalThreshold) return 'text-error-red';
    if (storageInfo.percentage >= warningThreshold) return 'text-warning-orange';
    return 'text-success-green';
  };

  const getProgressColor = () => {
    if (!storageInfo) return '';
    if (storageInfo.percentage >= criticalThreshold) return 'bg-error-red';
    if (storageInfo.percentage >= warningThreshold) return 'bg-warning-orange';
    return '';
  };

  const shouldShowWarning = () => {
    return storageInfo && storageInfo.percentage >= warningThreshold;
  };

  useEffect(() => {
    const updateStorageInfo = async () => {
      setIsLoading(true);
      try {
        const info = await calculateStorageUsage();
        setStorageInfo(info);
        
        if (info.percentage >= criticalThreshold) {
          onCleanupNeeded?.();
        }
      } catch (error) {
        console.error('Failed to update storage info:', error);
      } finally {
        setIsLoading(false);
      }
    };

    updateStorageInfo();
    const interval = setInterval(updateStorageInfo, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [calculateStorageUsage, criticalThreshold, onCleanupNeeded]);

  if (isLoading || !storageInfo) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <HardDrive className="h-4 w-4 text-muted-foreground animate-pulse" />
        <span className="text-sm text-muted-foreground">Checking storage...</span>
      </div>
    );
  }

  if (!showBreakdown) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`flex items-center gap-2 ${className}`}>
              <HardDrive className={`h-4 w-4 ${getStatusColor()}`} />
              {shouldShowWarning() && (
                <AlertTriangle className="h-3 w-3 text-warning-orange" />
              )}
              <Badge variant="outline" className={getStatusColor()}>
                {storageInfo.percentage.toFixed(0)}%
              </Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-center">
              <div className="font-medium">Storage Usage</div>
              <div className="text-xs opacity-80 mt-1">
                {formatBytes(storageInfo.used)} of {formatBytes(storageInfo.total)} used
              </div>
              <div className="text-xs opacity-80">
                {formatBytes(storageInfo.available)} available
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <HardDrive className={`h-4 w-4 ${getStatusColor()}`} />
          Storage Usage
          {shouldShowWarning() && (
            <AlertTriangle className="h-4 w-4 text-warning-orange" />
          )}
        </CardTitle>
        <CardDescription>
          {formatBytes(storageInfo.used)} of {formatBytes(storageInfo.total)} used
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Usage</span>
            <span className={getStatusColor()}>
              {storageInfo.percentage.toFixed(1)}%
            </span>
          </div>
          <Progress 
            value={storageInfo.percentage} 
            className={`h-2 ${getProgressColor()}`}
          />
        </div>

        {shouldShowWarning() && (
          <div className="flex items-start gap-2 p-3 bg-warning-orange/10 border border-warning-orange/20 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-warning-orange mt-0.5" />
            <div className="text-sm">
              <div className="font-medium text-warning-orange">Storage Warning</div>
              <div className="text-muted-foreground mt-1">
                {storageInfo.percentage >= criticalThreshold
                  ? 'Storage is critically low. Consider cleaning up data.'
                  : 'Storage is getting full. You may want to clean up old data.'
                }
              </div>
              {onCleanupNeeded && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onCleanupNeeded}
                  className="mt-2 h-7"
                >
                  Clean Up Data
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="text-sm font-medium flex items-center gap-2">
            Breakdown
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Approximate storage usage by data type</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          
          <div className="space-y-1 text-xs">
            {Object.entries(storageInfo.breakdown).map(([type, size]) => (
              <div key={type} className="flex justify-between">
                <span className="capitalize">{type}:</span>
                <span>{formatBytes(size)}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};