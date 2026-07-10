/**
 * Data Settings Component
 * Phase 6.4: User Preferences & UI State
 *
 * Data and performance preferences
 */

import React from 'react';
import {
  WifiOff,
  HardDrive,
  Zap,
  Database,
  Smartphone,
  Monitor,
  Activity,
  RotateCcw,
  Info,
} from 'lucide-react';
import { queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { DataPreferences, BandwidthMode } from '@/types/user-preferences';

const PRESERVED_KEYS = ['myK9Q_settings'];

interface DataSettingsProps {
  preferences?: DataPreferences | undefined;
  onUpdate: (preferences: Partial<DataPreferences>) => void;
  onReset: () => void;
}

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

  const handleClearCache = async () => {
    const confirmed = window.confirm(
      'This will clear all cached data and reload the app. Your settings and login will be preserved. Continue?'
    );
    if (!confirmed) return;

    const preserved = new Map<string, string>();
    for (const key of PRESERVED_KEYS) {
      const value = localStorage.getItem(key);
      if (value !== null) preserved.set(key, value);
    }
    // Supabase auth key uses dynamic prefix (sb-<ref>-auth-token)
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('sb-') && key.includes('auth-token')) {
        preserved.set(key, localStorage.getItem(key)!);
      }
    }
    localStorage.clear();
    for (const [key, value] of preserved) {
      localStorage.setItem(key, value);
    }

    queryClient.clear();

    // Firefox doesn't support indexedDB.databases()
    try {
      if (window.indexedDB?.databases) {
        const dbs = await window.indexedDB.databases();
        for (const db of dbs) {
          if (db.name) window.indexedDB.deleteDatabase(db.name);
        }
      } else if (window.indexedDB) {
        window.indexedDB.deleteDatabase('myK9ShowDB');
      }
    } catch {
      // IndexedDB cleanup is best-effort
    }

    window.location.reload();
  };

  return (
    <div className="space-y-6">
      {/* Local Storage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Local Storage
          </CardTitle>
          <CardDescription>Manage data cached on this device</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="font-medium">Clear Cached Data</Label>
              <div className="text-sm text-muted-foreground">
                Removes locally cached data and reloads the app. Your settings and login are
                preserved.
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleClearCache}>
              Clear Cache
            </Button>
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
            {bandwidthModeOptions.map(option => (
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
                    <div className="text-xs text-muted-foreground mt-1">{option.description}</div>
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
                onCheckedChange={checked => handleBooleanChange('preloadImages', checked)}
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
          <CardDescription>Control how the app behaves when you're offline</CardDescription>
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
              onCheckedChange={checked => handleBooleanChange('enableOfflineMode', checked)}
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
                  onCheckedChange={checked => handleBooleanChange('backgroundSync', checked)}
                />
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Offline mode allows you to view previously loaded data and make changes that will
                  be synchronized when you're back online.
                </AlertDescription>
              </Alert>
            </>
          )}
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
