import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import type { ExtendedSyncSettings } from './SyncSettingsPanel.types';

interface GeneralTabProps {
  settings: ExtendedSyncSettings;
  updateSettingsSection: <T extends keyof ExtendedSyncSettings>(
    section: T,
    updates: Partial<ExtendedSyncSettings[T]>
  ) => void;
}

export const GeneralTab: React.FC<GeneralTabProps> = ({ settings, updateSettingsSection }) => {
  return (
    <>
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
              onCheckedChange={checked => updateSettingsSection('autoSync', { enabled: checked })}
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
                    onValueChange={value =>
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
                    onCheckedChange={checked =>
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
                    onCheckedChange={checked =>
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
              onCheckedChange={checked =>
                updateSettingsSection('notifications', { syncComplete: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <Label>Sync Errors</Label>
            <Switch
              checked={settings.notifications.syncErrors}
              onCheckedChange={checked =>
                updateSettingsSection('notifications', { syncErrors: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <Label>Conflicts Detected</Label>
            <Switch
              checked={settings.notifications.conflictsDetected}
              onCheckedChange={checked =>
                updateSettingsSection('notifications', { conflictsDetected: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <Label>Offline Mode</Label>
            <Switch
              checked={settings.notifications.offlineMode}
              onCheckedChange={checked =>
                updateSettingsSection('notifications', { offlineMode: checked })
              }
            />
          </div>
        </CardContent>
      </Card>
    </>
  );
};
