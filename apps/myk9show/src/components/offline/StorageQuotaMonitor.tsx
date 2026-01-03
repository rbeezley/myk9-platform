/**
 * StorageQuotaMonitor - Real-time storage quota tracking and management
 * 
 * Provides:
 * - Real-time storage usage monitoring
 * - Visual storage breakdown by entity type
 * - Storage alerts and warnings
 * - Quota management and cleanup suggestions
 * - Performance impact indicators
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  HardDrive,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Trash2,
  Archive,
  Zap,
  Info,
  RefreshCw,
  Database,
  FileText,
  Image,
  Settings
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StorageInfo {
  used: number;
  available: number;
  total: number;
  usagePercentage: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  trendValue: number; // percentage change
  lastUpdated: Date;
}

export interface EntityStorageUsage {
  entityType: string;
  name: string;
  icon: React.ReactNode;
  size: number;
  percentage: number;
  itemCount: number;
  trend: 'up' | 'down' | 'stable';
  trendValue: number;
  canCompress: boolean;
  canArchive: boolean;
}

interface StorageQuotaMonitorProps {
  className?: string;
  showAlerts?: boolean;
  showBreakdown?: boolean;
  refreshInterval?: number; // milliseconds
  onStorageAction?: (action: string, entityType?: string) => void;
}

export function StorageQuotaMonitor({
  className,
  showAlerts = true,
  showBreakdown = true,
  refreshInterval = 30000, // 30 seconds
  onStorageAction
}: StorageQuotaMonitorProps) {
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [entityUsage, setEntityUsage] = useState<EntityStorageUsage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Mock storage data for demonstration
  const mockStorageInfo: StorageInfo = useMemo(() => ({
    used: 52428800, // 50MB
    available: 157286400, // 150MB
    total: 209715200, // 200MB
    usagePercentage: 25,
    trend: 'increasing',
    trendValue: 5.2,
    lastUpdated: new Date()
  }), []);

  const mockEntityUsage: EntityStorageUsage[] = useMemo(() => [
    {
      entityType: 'entries',
      name: 'Show Entries',
      icon: <FileText className="h-4 w-4" />,
      size: 31457280, // 30MB
      percentage: 60,
      itemCount: 1250,
      trend: 'up',
      trendValue: 8.5,
      canCompress: true,
      canArchive: true
    },
    {
      entityType: 'dogs',
      name: 'Dog Records',
      icon: <Database className="h-4 w-4" />,
      size: 10485760, // 10MB
      percentage: 20,
      itemCount: 450,
      trend: 'stable',
      trendValue: 0,
      canCompress: true,
      canArchive: false
    },
    {
      entityType: 'shows',
      name: 'Show Data',
      icon: <Archive className="h-4 w-4" />,
      size: 5242880, // 5MB
      percentage: 10,
      itemCount: 25,
      trend: 'up',
      trendValue: 2.1,
      canCompress: false,
      canArchive: true
    },
    {
      entityType: 'images',
      name: 'Images & Media',
      icon: <Image className="h-4 w-4" />,
      size: 3145728, // 3MB
      percentage: 6,
      itemCount: 120,
      trend: 'down',
      trendValue: -1.5,
      canCompress: true,
      canArchive: true
    },
    {
      entityType: 'cache',
      name: 'Cache & Temp',
      icon: <Zap className="h-4 w-4" />,
      size: 1572864, // 1.5MB
      percentage: 3,
      itemCount: 0,
      trend: 'stable',
      trendValue: 0,
      canCompress: false,
      canArchive: false
    },
    {
      entityType: 'settings',
      name: 'Settings & Config',
      icon: <Settings className="h-4 w-4" />,
      size: 524288, // 0.5MB
      percentage: 1,
      itemCount: 1,
      trend: 'stable',
      trendValue: 0,
      canCompress: false,
      canArchive: false
    }
  ], []);

  // Load storage information
  const loadStorageInfo = useCallback(async () => {
    setIsLoading(true);
    try {
      // Simulate API call or actual storage calculation
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setStorageInfo(mockStorageInfo);
      setEntityUsage(mockEntityUsage);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to load storage info:', error);
    } finally {
      setIsLoading(false);
    }
  }, [mockStorageInfo, mockEntityUsage]);

  // Auto-refresh storage info
  useEffect(() => {
    loadStorageInfo();
    
    const interval = setInterval(loadStorageInfo, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval, loadStorageInfo]);

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  // Get storage status
  const getStorageStatus = () => {
    if (!storageInfo) return { level: 'unknown', color: 'gray', message: 'Loading...' };
    
    if (storageInfo.usagePercentage >= 90) {
      return { level: 'critical', color: 'red', message: 'Storage critically full' };
    }
    if (storageInfo.usagePercentage >= 75) {
      return { level: 'warning', color: 'orange', message: 'Storage running low' };
    }
    if (storageInfo.usagePercentage >= 50) {
      return { level: 'moderate', color: 'yellow', message: 'Storage moderately used' };
    }
    return { level: 'good', color: 'green', message: 'Storage healthy' };
  };

  const status = getStorageStatus();

  // Calculate optimization potential
  const optimizationPotential = useMemo(() => {
    const compressibleSize = entityUsage
      .filter(entity => entity.canCompress)
      .reduce((sum, entity) => sum + entity.size * 0.3, 0); // Assume 30% compression

    const archivableSize = entityUsage
      .filter(entity => entity.canArchive)
      .reduce((sum, entity) => sum + entity.size * 0.8, 0); // Assume 80% can be archived

    return {
      compression: compressibleSize,
      archiving: archivableSize,
      total: compressibleSize + archivableSize
    };
  }, [entityUsage]);

  // Handle storage actions
  const handleStorageAction = (action: string, entityType?: string) => {
    console.log(`Storage action: ${action}`, entityType);
    onStorageAction?.(action, entityType);
    
    // Refresh data after action
    setTimeout(loadStorageInfo, 1000);
  };

  if (isLoading) {
    return (
      <Card className={cn("", className)}>
        <CardContent className="flex items-center justify-center p-8">
          <RefreshCw className="h-6 w-6 animate-spin mr-2" />
          <span>Loading storage information...</span>
        </CardContent>
      </Card>
    );
  }

  if (!storageInfo) {
    return (
      <Card className={cn("", className)}>
        <CardContent className="flex items-center justify-center p-8 text-muted-foreground">
          <AlertTriangle className="h-6 w-6 mr-2" />
          <span>Failed to load storage information</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Storage Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              Storage Usage
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge 
                variant={status.level === 'good' ? 'default' : status.level === 'warning' ? 'secondary' : 'destructive'}
              >
                {status.message}
              </Badge>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={loadStorageInfo}>
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Refresh storage data</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Usage Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm">
                {formatFileSize(storageInfo.used)} of {formatFileSize(storageInfo.total)} used
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {storageInfo.usagePercentage}%
                </span>
                {storageInfo.trend !== 'stable' && (
                  <div className="flex items-center gap-1">
                    {storageInfo.trend === 'increasing' ? (
                      <TrendingUp className="h-3 w-3 text-red-500" />
                    ) : (
                      <TrendingDown className="h-3 w-3 text-green-500" />
                    )}
                    <span className={cn(
                      "text-xs",
                      storageInfo.trend === 'increasing' ? 'text-red-500' : 'text-green-500'
                    )}>
                      {storageInfo.trendValue}%
                    </span>
                  </div>
                )}
              </div>
            </div>
            <Progress 
              value={storageInfo.usagePercentage} 
              className={cn(
                "h-3",
                status.level === 'critical' && "bg-red-100",
                status.level === 'warning' && "bg-orange-100"
              )}
            />
            <div className="text-xs text-muted-foreground">
              {formatFileSize(storageInfo.available)} available • Last updated: {lastRefresh?.toLocaleTimeString()}
            </div>
          </div>

          {/* Storage Alerts */}
          {showAlerts && status.level !== 'good' && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p>{status.message}. Consider cleaning up old data or compressing large files.</p>
                  {optimizationPotential.total > 0 && (
                    <p className="text-sm">
                      Potential savings: {formatFileSize(optimizationPotential.total)} through compression and archiving.
                    </p>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Quick Actions */}
          <div className="flex items-center gap-2 pt-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleStorageAction('cleanup')}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clean Up
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleStorageAction('compress')}
            >
              <Archive className="h-4 w-4 mr-2" />
              Compress
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleStorageAction('optimize')}
            >
              <Zap className="h-4 w-4 mr-2" />
              Optimize
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Storage Breakdown */}
      {showBreakdown && (
        <Card>
          <CardHeader>
            <CardTitle>Storage Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {entityUsage.map((entity) => (
                <div key={entity.entityType} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        {entity.icon}
                        <span className="font-medium">{entity.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {entity.trend !== 'stable' && (
                          <div className="flex items-center gap-1">
                            {entity.trend === 'up' ? (
                              <TrendingUp className="h-3 w-3 text-red-500" />
                            ) : (
                              <TrendingDown className="h-3 w-3 text-green-500" />
                            )}
                            <span className={cn(
                              "text-xs",
                              entity.trend === 'up' ? 'text-red-500' : 'text-green-500'
                            )}>
                              {entity.trendValue}%
                            </span>
                          </div>
                        )}
                        {entity.canCompress && (
                          <Badge variant="outline" className="text-xs">
                            Compressible
                          </Badge>
                        )}
                        {entity.canArchive && (
                          <Badge variant="outline" className="text-xs">
                            Archivable
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm font-medium">
                          {formatFileSize(entity.size)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {entity.itemCount > 0 ? `${entity.itemCount} items` : 'System data'}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        {entity.canCompress && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => handleStorageAction('compress', entity.entityType)}
                                >
                                  <Archive className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Compress {entity.name}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        
                        {entity.canArchive && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => handleStorageAction('archive', entity.entityType)}
                                >
                                  <Database className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Archive old {entity.name}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        
                        {entity.entityType === 'cache' && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => handleStorageAction('clear', entity.entityType)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Clear cache</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Progress value={entity.percentage} className="flex-1 h-1.5" />
                    <span className="text-xs text-muted-foreground w-10 text-right">
                      {entity.percentage}%
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Optimization Summary */}
            {optimizationPotential.total > 0 && (
              <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="h-4 w-4 text-blue-500" />
                  <span className="font-medium">Optimization Potential</span>
                </div>
                <div className="space-y-1 text-sm text-muted-foreground">
                  {optimizationPotential.compression > 0 && (
                    <div>• Save ~{formatFileSize(optimizationPotential.compression)} through compression</div>
                  )}
                  {optimizationPotential.archiving > 0 && (
                    <div>• Save ~{formatFileSize(optimizationPotential.archiving)} through archiving</div>
                  )}
                  <div className="font-medium pt-1">
                    Total potential savings: {formatFileSize(optimizationPotential.total)}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default StorageQuotaMonitor;