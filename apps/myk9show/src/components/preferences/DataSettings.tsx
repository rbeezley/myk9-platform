/**
 * Data Settings Component
 * Phase 6.4: User Preferences & UI State
 * 
 * Data synchronization and performance preferences
 */

import React from 'react';
import { 
  WifiOff, 
  HardDrive, 
  Zap, 
  Database, 
  RefreshCw,
  Download,
  Smartphone,
  Monitor,
  Activity,
  RotateCcw,
  Info
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { 
  DataPreferences, 
  SyncMode, 
  CacheStrategy, 
  BandwidthMode 
} from '@/types/user-preferences';

interface DataSettingsProps {
  preferences?: DataPreferences;
  onUpdate: (preferences: Partial<DataPreferences>) => void;
  onReset: () => void;
}

const syncModeOptions: Array<{ 
  value: SyncMode; 
  label: string; 
  description: string; 
  icon: React.ComponentType<{ className?: string }>;
  recommended?: boolean;
}> = [
  { 
    value: 'auto', 
    label: 'Automatic Sync', 
    description: 'Sync changes immediately when connected',
    icon: RefreshCw,
    recommended: true,
  },
  { 
    value: 'manual', 
    label: 'Manual Sync', 
    description: 'Only sync when you choose to',
    icon: Download,
  },
  { 
    value: 'offline-first', 
    label: 'Offline First', 
    description: 'Work offline, sync when convenient',
    icon: WifiOff,
  },
];

const cacheStrategyOptions: Array<{ 
  value: CacheStrategy; 
  label: string; 
  description: string;
  storageImpact: string;
}> = [
  { 
    value: 'aggressive', 
    label: 'Aggressive Caching', 
    description: 'Cache everything for fastest performance',
    storageImpact: 'High storage usage',
  },
  { 
    value: 'balanced', 
    label: 'Balanced Caching', 
    description: 'Balance performance and storage usage',
    storageImpact: 'Moderate storage usage',
  },
  { 
    value: 'minimal', 
    label: 'Minimal Caching', 
    description: 'Cache only essential data',
    storageImpact: 'Low storage usage',
  },
];

const bandwidthModeOptions: Array<{ 
  value: BandwidthMode; 
  label: string; 
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { 
    value: 'high', 
    label: 'High Quality', 
    description: 'Full resolution images and rich content',
    icon: Monitor,
  },
  { 
    value: 'medium', 
    label: 'Medium Quality', 
    description: 'Compressed images, reduced file sizes',
    icon: Activity,
  },
  { 
    value: 'low', 
    label: 'Low Quality', 
    description: 'Minimal images, text-focused content',
    icon: Smartphone,
  },
  { 
    value: 'data-saver', 
    label: 'Data Saver', 
    description: 'Maximum data savings, basic content only',
    icon: Database,
  },
];

export function DataSettings({ preferences, onUpdate, onReset }: DataSettingsProps) {
  // Mock cache usage data (would come from actual cache in real implementation)
  const cacheUsage = {
    used: 65, // MB
    total: preferences?.maxCacheSize || 100, // MB
    percentage: ((65 / (preferences?.maxCacheSize || 100)) * 100),
  };

  /**
   * Handle sync mode change
   */
  const handleSyncModeChange = (syncMode: SyncMode) => {
    onUpdate({ syncMode });
  };

  /**
   * Handle cache strategy change
   */
  const handleCacheStrategyChange = (cacheStrategy: CacheStrategy) => {
    onUpdate({ cacheStrategy });
  };

  /**
   * Handle bandwidth mode change
   */
  const handleBandwidthModeChange = (bandwidthMode: BandwidthMode) => {
    onUpdate({ bandwidthMode });
  };

  /**
   * Handle boolean setting changes
   */
  const handleBooleanChange = (setting: keyof DataPreferences, value: boolean) => {
    onUpdate({ [setting]: value });
  };

  /**
   * Handle cache size change
   */
  const handleCacheSizeChange = (maxCacheSize: number) => {
    onUpdate({ maxCacheSize });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold tracking-tight mb-2">Data & Performance</h3>
        <p className="text-sm text-muted-foreground">
          Control how data is synchronized and cached for optimal performance
        </p>
      </div>

      {/* Sync Mode */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Synchronization Mode
          </CardTitle>
          <CardDescription>
            Choose how and when your data syncs across devices
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={preferences?.syncMode || 'auto'}
            onValueChange={handleSyncModeChange}
            className="space-y-4"
          >
            {syncModeOptions.map((option) => (
              <div key={option.value} className="flex items-center space-x-3">
                <RadioGroupItem value={option.value} id={`sync-${option.value}`} />
                <Label htmlFor={`sync-${option.value}`} className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <option.icon className="h-4 w-4" />
                    <span className="font-medium">{option.label}</span>
                    {option.recommended && (
                      <Badge variant="secondary" className="text-xs">Recommended</Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {option.description}
                  </div>
                </Label>
              </div>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Cache Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Cache Settings
          </CardTitle>
          <CardDescription>
            Manage local data storage and caching behavior
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Cache Strategy */}
          <div>
            <Label className="font-medium mb-3 block">Cache Strategy</Label>
            <RadioGroup
              value={preferences?.cacheStrategy || 'balanced'}
              onValueChange={handleCacheStrategyChange}
              className="space-y-3"
            >
              {cacheStrategyOptions.map((option) => (
                <div key={option.value} className="flex items-center space-x-3">
                  <RadioGroupItem value={option.value} id={`cache-${option.value}`} />
                  <Label htmlFor={`cache-${option.value}`} className="flex-1 cursor-pointer">
                    <div className="font-medium">{option.label}</div>
                    <div className="text-sm text-muted-foreground">
                      {option.description}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {option.storageImpact}
                    </div>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <Separator />

          {/* Cache Size Limit */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <Label className="font-medium">Cache Size Limit</Label>
              <Badge variant="outline" className="text-xs">
                {preferences?.maxCacheSize || 100} MB
              </Badge>
            </div>
            <div className="space-y-3">
              <Slider
                value={[preferences?.maxCacheSize || 100]}
                onValueChange={([value]) => handleCacheSizeChange(value)}
                max={500}
                min={50}
                step={25}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>50 MB</span>
                <span>Minimal</span>
                <span>Moderate</span>
                <span>Generous</span>
                <span>500 MB</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Current Cache Usage */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="font-medium">Current Usage</Label>
              <span className="text-sm text-muted-foreground">
                {cacheUsage.used} MB of {cacheUsage.total} MB
              </span>
            </div>
            <Progress value={cacheUsage.percentage} className="h-2" />
            <div className="flex justify-between items-center mt-2">
              <span className="text-xs text-muted-foreground">
                {Math.round(cacheUsage.percentage)}% used
              </span>
              <Button variant="outline" size="sm" className="text-xs h-6">
                Clear Cache
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bandwidth & Quality */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Bandwidth & Quality
          </CardTitle>
          <CardDescription>
            Optimize data usage and content quality based on your connection
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <RadioGroup
            value={preferences?.bandwidthMode || 'high'}
            onValueChange={handleBandwidthModeChange}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {bandwidthModeOptions.map((option) => (
              <div key={option.value}>
                <RadioGroupItem
                  value={option.value}
                  id={`bandwidth-${option.value}`}
                  className="peer sr-only"
                />
                <Label
                  htmlFor={`bandwidth-${option.value}`}
                  className="flex flex-col items-center justify-between rounded-lg border-2 border-muted p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                >
                  <option.icon className="h-6 w-6 mb-2" />
                  <div className="text-center">
                    <div className="font-medium">{option.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {option.description}
                    </div>
                  </div>
                </Label>
              </div>
            ))}
          </RadioGroup>

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="font-medium">Preload Images</Label>
                <div className="text-sm text-muted-foreground">
                  Download images in advance for faster viewing
                </div>
              </div>
              <Switch
                checked={preferences?.preloadImages ?? true}
                onCheckedChange={(checked) => handleBooleanChange('preloadImages', checked)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Offline Mode */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <WifiOff className="h-5 w-5" />
            Offline Mode
          </CardTitle>
          <CardDescription>
            Control how the app behaves when you're offline
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="font-medium">Enable Offline Mode</Label>
              <div className="text-sm text-muted-foreground">
                Allow the app to work without an internet connection
              </div>
            </div>
            <Switch
              checked={preferences?.enableOfflineMode ?? true}
              onCheckedChange={(checked) => handleBooleanChange('enableOfflineMode', checked)}
            />
          </div>

          {preferences?.enableOfflineMode && (
            <>
              <Separator />
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="font-medium">Background Sync</Label>
                  <div className="text-sm text-muted-foreground">
                    Sync data in the background when connection is restored
                  </div>
                </div>
                <Switch
                  checked={preferences?.backgroundSync ?? true}
                  onCheckedChange={(checked) => handleBooleanChange('backgroundSync', checked)}
                />
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Offline mode allows you to view previously loaded data and make changes 
                  that will be synchronized when you're back online.
                </AlertDescription>
              </Alert>
            </>
          )}
        </CardContent>
      </Card>

      {/* Performance Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <Label className="font-medium">Sync Mode:</Label>
              <div className="text-muted-foreground">
                {syncModeOptions.find(m => m.value === preferences?.syncMode)?.label || 'Automatic Sync'}
              </div>
            </div>
            <div>
              <Label className="font-medium">Cache Strategy:</Label>
              <div className="text-muted-foreground">
                {cacheStrategyOptions.find(c => c.value === preferences?.cacheStrategy)?.label || 'Balanced Caching'}
              </div>
            </div>
            <div>
              <Label className="font-medium">Bandwidth Mode:</Label>
              <div className="text-muted-foreground">
                {bandwidthModeOptions.find(b => b.value === preferences?.bandwidthMode)?.label || 'High Quality'}
              </div>
            </div>
            <div>
              <Label className="font-medium">Cache Limit:</Label>
              <div className="text-muted-foreground">
                {preferences?.maxCacheSize || 100} MB
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reset Button */}
      <div className="flex justify-end">
        <Button variant="outline" onClick={onReset} className="flex items-center gap-2">
          <RotateCcw className="h-4 w-4" />
          Reset Data Settings
        </Button>
      </div>
    </div>
  );
}