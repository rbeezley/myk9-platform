/**
 * SyncSettingsPanel - User-configurable sync preferences
 * 
 * Provides comprehensive sync configuration including:
 * - Auto-sync settings and intervals
 * - Conflict resolution strategies
 * - Performance tuning options
 * - Network preferences
 * - Notification settings
 * - Advanced sync options
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useSyncStore } from '@/store/syncStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  Settings,
  Wifi,
  Shield,
  Zap,
  Info,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Save,
  RotateCcw
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ExtendedSyncSettings {
  // Auto-sync configuration
  autoSync: {
    enabled: boolean;
    interval: number; // minutes
    onlyOnWifi: boolean;
    batteryOptimization: boolean;
  };
  
  // Conflict resolution
  conflicts: {
    strategy: 'manual' | 'latest-wins' | 'merge' | 'ask-always';
    autoResolveSimple: boolean;
    showResolutionNotifications: boolean;
  };
  
  // Performance settings
  performance: {
    batchSize: number;
    maxConcurrentOperations: number;
    retryAttempts: number;
    timeoutDuration: number; // seconds
    compressionEnabled: boolean;
  };
  
  // Network preferences
  network: {
    allowCellular: boolean;
    maxCellularUsage: number; // MB per day
    lowBandwidthMode: boolean;
    prefetchData: boolean;
  };
  
  // Notifications
  notifications: {
    syncComplete: boolean;
    syncErrors: boolean;
    conflictsDetected: boolean;
    offlineMode: boolean;
    queueBacklog: boolean;
  };
  
  // Advanced options
  advanced: {
    enableDebugLogging: boolean;
    keepSyncHistory: boolean;
    historyRetentionDays: number;
    enableMetrics: boolean;
    backgroundSync: boolean;
  };
}

interface SyncSettingsPanelProps {
  className?: string;
  onSettingsChange?: (settings: ExtendedSyncSettings) => void;
}

export function SyncSettingsPanel({ className, onSettingsChange }: SyncSettingsPanelProps) {
  const { updateSyncSettings } = useSyncStore();
  
  // Default settings
  const defaultSettings: ExtendedSyncSettings = useMemo(() => ({
    autoSync: {
      enabled: true,
      interval: 15,
      onlyOnWifi: false,
      batteryOptimization: true
    },
    conflicts: {
      strategy: 'manual',
      autoResolveSimple: true,
      showResolutionNotifications: true
    },
    performance: {
      batchSize: 50,
      maxConcurrentOperations: 3,
      retryAttempts: 3,
      timeoutDuration: 30,
      compressionEnabled: true
    },
    network: {
      allowCellular: true,
      maxCellularUsage: 100,
      lowBandwidthMode: false,
      prefetchData: true
    },
    notifications: {
      syncComplete: false,
      syncErrors: true,
      conflictsDetected: true,
      offlineMode: true,
      queueBacklog: true
    },
    advanced: {
      enableDebugLogging: false,
      keepSyncHistory: true,
      historyRetentionDays: 30,
      enableMetrics: true,
      backgroundSync: true
    }
  }), []);

  const [settings, setSettings] = useState<ExtendedSyncSettings>(defaultSettings);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  // Track changes
  useEffect(() => {
    const hasUnsavedChanges = JSON.stringify(settings) !== JSON.stringify(defaultSettings);
    setHasChanges(hasUnsavedChanges);
  }, [settings, defaultSettings]);

  // Update settings section
  const updateSettingsSection = <T extends keyof ExtendedSyncSettings>(
    section: T,
    updates: Partial<ExtendedSyncSettings[T]>
  ) => {
    setSettings(prev => ({
      ...prev,
      [section]: { ...prev[section], ...updates }
    }));
  };

  // Save settings
  const handleSave = async () => {
    setSaving(true);
    try {
      // Convert extended settings to basic settings for store
      const basicSettings = {
        autoSync: settings.autoSync.enabled,
        syncInterval: settings.autoSync.interval * 60000, // Convert to ms
        batchSize: settings.performance.batchSize,
        retryAttempts: settings.performance.retryAttempts
      };
      await updateSyncSettings(basicSettings);
      onSettingsChange?.(settings);
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to save sync settings:', error);
    } finally {
      setSaving(false);
    }
  };

  // Reset to defaults
  const handleReset = () => {
    setSettings(defaultSettings);
  };

  // Discard changes
  const handleDiscard = () => {
    setSettings(defaultSettings);
  };

  const getConflictStrategyDescription = (strategy: string) => {
    switch (strategy) {
      case 'manual':
        return 'Always prompt user to resolve conflicts';
      case 'latest-wins':
        return 'Automatically use the most recent version';
      case 'merge':
        return 'Attempt to merge changes automatically';
      case 'ask-always':
        return 'Ask for strategy on each conflict';
      default:
        return '';
    }
  };

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Sync Settings</h2>
          <p className="text-muted-foreground">Configure synchronization preferences and behavior</p>
        </div>
        
        <div className="flex items-center gap-2">
          {hasChanges && (
            <>
              <Button variant="outline" onClick={handleDiscard}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Discard
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Changes
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Settings Tabs */}
      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="general" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="conflicts" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Conflicts
          </TabsTrigger>
          <TabsTrigger value="performance" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Performance
          </TabsTrigger>
          <TabsTrigger value="network" className="flex items-center gap-2">
            <Wifi className="h-4 w-4" />
            Network
          </TabsTrigger>
          <TabsTrigger value="advanced" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Advanced
          </TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>Auto-Sync Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="auto-sync">Enable Auto-Sync</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically synchronize data in the background
                  </p>
                </div>
                <Switch
                  id="auto-sync"
                  checked={settings.autoSync.enabled}
                  onCheckedChange={(checked) => 
                    updateSettingsSection('autoSync', { enabled: checked })
                  }
                />
              </div>

              {settings.autoSync.enabled && (
                <>
                  <Separator />
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Sync Interval: {settings.autoSync.interval} minutes</Label>
                      <Slider
                        value={[settings.autoSync.interval]}
                        onValueChange={(value) => 
                          updateSettingsSection('autoSync', { interval: value[0] })
                        }
                        max={120}
                        min={5}
                        step={5}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>5 min</span>
                        <span>120 min</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label>WiFi Only</Label>
                        <p className="text-sm text-muted-foreground">
                          Only sync when connected to WiFi
                        </p>
                      </div>
                      <Switch
                        checked={settings.autoSync.onlyOnWifi}
                        onCheckedChange={(checked) => 
                          updateSettingsSection('autoSync', { onlyOnWifi: checked })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label>Battery Optimization</Label>
                        <p className="text-sm text-muted-foreground">
                          Reduce sync frequency when battery is low
                        </p>
                      </div>
                      <Switch
                        checked={settings.autoSync.batteryOptimization}
                        onCheckedChange={(checked) => 
                          updateSettingsSection('autoSync', { batteryOptimization: checked })
                        }
                      />
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Sync Complete</Label>
                <Switch
                  checked={settings.notifications.syncComplete}
                  onCheckedChange={(checked) => 
                    updateSettingsSection('notifications', { syncComplete: checked })
                  }
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label>Sync Errors</Label>
                <Switch
                  checked={settings.notifications.syncErrors}
                  onCheckedChange={(checked) => 
                    updateSettingsSection('notifications', { syncErrors: checked })
                  }
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label>Conflicts Detected</Label>
                <Switch
                  checked={settings.notifications.conflictsDetected}
                  onCheckedChange={(checked) => 
                    updateSettingsSection('notifications', { conflictsDetected: checked })
                  }
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label>Offline Mode</Label>
                <Switch
                  checked={settings.notifications.offlineMode}
                  onCheckedChange={(checked) => 
                    updateSettingsSection('notifications', { offlineMode: checked })
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Conflict Resolution */}
        <TabsContent value="conflicts">
          <Card>
            <CardHeader>
              <CardTitle>Conflict Resolution Strategy</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Default Strategy</Label>
                <Select
                  value={settings.conflicts.strategy}
                  onValueChange={(value: 'manual' | 'latest-wins' | 'merge' | 'ask-always') => 
                    updateSettingsSection('conflicts', { strategy: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual Resolution</SelectItem>
                    <SelectItem value="latest-wins">Latest Wins</SelectItem>
                    <SelectItem value="merge">Auto Merge</SelectItem>
                    <SelectItem value="ask-always">Ask Always</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  {getConflictStrategyDescription(settings.conflicts.strategy)}
                </p>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Auto-resolve Simple Conflicts</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically resolve conflicts with clear solutions
                  </p>
                </div>
                <Switch
                  checked={settings.conflicts.autoResolveSimple}
                  onCheckedChange={(checked) => 
                    updateSettingsSection('conflicts', { autoResolveSimple: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Show Resolution Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Notify when conflicts are automatically resolved
                  </p>
                </div>
                <Switch
                  checked={settings.conflicts.showResolutionNotifications}
                  onCheckedChange={(checked) => 
                    updateSettingsSection('conflicts', { showResolutionNotifications: checked })
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Settings */}
        <TabsContent value="performance">
          <Card>
            <CardHeader>
              <CardTitle>Performance Optimization</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Batch Size: {settings.performance.batchSize} items</Label>
                <Slider
                  value={[settings.performance.batchSize]}
                  onValueChange={(value) => 
                    updateSettingsSection('performance', { batchSize: value[0] })
                  }
                  max={200}
                  min={10}
                  step={10}
                />
              </div>

              <div className="space-y-2">
                <Label>Max Concurrent Operations: {settings.performance.maxConcurrentOperations}</Label>
                <Slider
                  value={[settings.performance.maxConcurrentOperations]}
                  onValueChange={(value) => 
                    updateSettingsSection('performance', { maxConcurrentOperations: value[0] })
                  }
                  max={10}
                  min={1}
                  step={1}
                />
              </div>

              <div className="space-y-2">
                <Label>Retry Attempts: {settings.performance.retryAttempts}</Label>
                <Slider
                  value={[settings.performance.retryAttempts]}
                  onValueChange={(value) => 
                    updateSettingsSection('performance', { retryAttempts: value[0] })
                  }
                  max={10}
                  min={0}
                  step={1}
                />
              </div>

              <div className="space-y-2">
                <Label>Timeout Duration</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={settings.performance.timeoutDuration}
                    onChange={(e) => 
                      updateSettingsSection('performance', { 
                        timeoutDuration: parseInt(e.target.value) || 30 
                      })
                    }
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">seconds</span>
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Enable Compression</Label>
                  <p className="text-sm text-muted-foreground">
                    Compress data to reduce network usage
                  </p>
                </div>
                <Switch
                  checked={settings.performance.compressionEnabled}
                  onCheckedChange={(checked) => 
                    updateSettingsSection('performance', { compressionEnabled: checked })
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Network Settings */}
        <TabsContent value="network">
          <Card>
            <CardHeader>
              <CardTitle>Network Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Allow Cellular Data</Label>
                  <p className="text-sm text-muted-foreground">
                    Use cellular connection for syncing
                  </p>
                </div>
                <Switch
                  checked={settings.network.allowCellular}
                  onCheckedChange={(checked) => 
                    updateSettingsSection('network', { allowCellular: checked })
                  }
                />
              </div>

              {settings.network.allowCellular && (
                <div className="space-y-2">
                  <Label>Max Cellular Usage</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={settings.network.maxCellularUsage}
                      onChange={(e) => 
                        updateSettingsSection('network', { 
                          maxCellularUsage: parseInt(e.target.value) || 100 
                        })
                      }
                      className="w-20"
                    />
                    <span className="text-sm text-muted-foreground">MB per day</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Low Bandwidth Mode</Label>
                  <p className="text-sm text-muted-foreground">
                    Optimize for slower connections
                  </p>
                </div>
                <Switch
                  checked={settings.network.lowBandwidthMode}
                  onCheckedChange={(checked) => 
                    updateSettingsSection('network', { lowBandwidthMode: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Prefetch Data</Label>
                  <p className="text-sm text-muted-foreground">
                    Download data in advance when possible
                  </p>
                </div>
                <Switch
                  checked={settings.network.prefetchData}
                  onCheckedChange={(checked) => 
                    updateSettingsSection('network', { prefetchData: checked })
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Advanced Settings */}
        <TabsContent value="advanced">
          <Card>
            <CardHeader>
              <CardTitle>Advanced Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  These settings are for advanced users. Changing them may affect sync performance.
                </AlertDescription>
              </Alert>

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Debug Logging</Label>
                  <p className="text-sm text-muted-foreground">
                    Enable detailed sync operation logging
                  </p>
                </div>
                <Switch
                  checked={settings.advanced.enableDebugLogging}
                  onCheckedChange={(checked) => 
                    updateSettingsSection('advanced', { enableDebugLogging: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Keep Sync History</Label>
                  <p className="text-sm text-muted-foreground">
                    Maintain history of sync operations
                  </p>
                </div>
                <Switch
                  checked={settings.advanced.keepSyncHistory}
                  onCheckedChange={(checked) => 
                    updateSettingsSection('advanced', { keepSyncHistory: checked })
                  }
                />
              </div>

              {settings.advanced.keepSyncHistory && (
                <div className="space-y-2">
                  <Label>History Retention</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={settings.advanced.historyRetentionDays}
                      onChange={(e) => 
                        updateSettingsSection('advanced', { 
                          historyRetentionDays: parseInt(e.target.value) || 30 
                        })
                      }
                      className="w-20"
                    />
                    <span className="text-sm text-muted-foreground">days</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Background Sync</Label>
                  <p className="text-sm text-muted-foreground">
                    Continue syncing when app is in background
                  </p>
                </div>
                <Switch
                  checked={settings.advanced.backgroundSync}
                  onCheckedChange={(checked) => 
                    updateSettingsSection('advanced', { backgroundSync: checked })
                  }
                />
              </div>

              <Separator />

              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handleReset}>
                  Reset to Defaults
                </Button>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-4 w-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>This will reset all settings to their default values</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Save notification */}
      {hasChanges && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            You have unsaved changes. Click "Save Changes" to apply your settings.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export default SyncSettingsPanel;