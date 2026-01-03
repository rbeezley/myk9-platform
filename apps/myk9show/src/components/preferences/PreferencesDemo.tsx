/**
 * Preferences Demo Component
 * Phase 6.4: User Preferences & UI State
 * 
 * Demonstration component showcasing the preferences system
 */

import React, { useState } from 'react';
import { 
  Settings, 
  Monitor, 
  Bell, 
  Wifi, 
  Shield, 
  Palette,
  Eye,
  Users,
  Database
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PreferencesDialog } from './PreferencesDialog';
import { SyncStatusIndicator } from './SyncStatusIndicator';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { useAuthUser } from '@/hooks/useAuthUser';
import { useEnhancedTheme } from '@/hooks/useThemeHooks';

export function PreferencesDemo() {
  const user = useAuthUser();
  const { preferences, loading, syncState } = useUserPreferences(user?.id || null);
  const { theme, themeMode } = useEnhancedTheme();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!user) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Preferences Demo
          </CardTitle>
          <CardDescription>
            Please sign in to access the preferences system
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center space-y-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="text-sm text-muted-foreground">Loading preferences...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight mb-2">
          Preferences System Demo
        </h1>
        <p className="text-muted-foreground">
          Phase 6.4: User Preferences & UI State
        </p>
      </div>

      {/* Current Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wifi className="h-5 w-5" />
            Current Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-sm font-medium mb-1">Theme</div>
              <Badge variant="outline">
                {theme} ({themeMode})
              </Badge>
            </div>
            <div>
              <div className="text-sm font-medium mb-1">Sync Status</div>
              <SyncStatusIndicator syncState={syncState} compact />
            </div>
            <div>
              <div className="text-sm font-medium mb-1">User</div>
              <Badge variant="secondary">
                {user.email}
              </Badge>
            </div>
          </div>
          
          <SyncStatusIndicator syncState={syncState} />
        </CardContent>
      </Card>

      {/* Preferences Overview */}
      {preferences && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Theme Preferences */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Monitor className="h-4 w-4" />
                Theme
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mode:</span>
                <Badge variant="outline" className="text-xs">
                  {preferences.theme.mode}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Color:</span>
                <Badge 
                  variant="outline" 
                  className="text-xs"
                  style={{ 
                    color: preferences.theme.colorScheme === 'blue' ? '#007AFF' : 
                           preferences.theme.colorScheme === 'purple' ? '#5856D6' :
                           preferences.theme.colorScheme === 'green' ? '#34C759' : '#FF9500'
                  }}
                >
                  {preferences.theme.colorScheme}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Density:</span>
                <Badge variant="outline" className="text-xs">
                  {preferences.theme.layoutDensity}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Font Size:</span>
                <Badge variant="outline" className="text-xs">
                  {preferences.theme.fontSize}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Notification Preferences */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Bell className="h-4 w-4" />
                Notifications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Enabled:</span>
                <Badge variant={preferences.notifications.enabled ? "default" : "secondary"} className="text-xs">
                  {preferences.notifications.enabled ? 'Yes' : 'No'}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Browser:</span>
                <Badge variant={preferences.notifications.delivery.browser ? "default" : "outline"} className="text-xs">
                  {preferences.notifications.delivery.browser ? 'On' : 'Off'}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sound:</span>
                <Badge variant={preferences.notifications.sound.enabled ? "default" : "outline"} className="text-xs">
                  {preferences.notifications.sound.enabled ? 'On' : 'Off'}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Quiet Hours:</span>
                <Badge variant={preferences.notifications.timing.quietHours.enabled ? "default" : "outline"} className="text-xs">
                  {preferences.notifications.timing.quietHours.enabled ? 'Active' : 'Off'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Competition Preferences */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Eye className="h-4 w-4" />
                Competition
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">View:</span>
                <Badge variant="outline" className="text-xs">
                  {preferences.competition.defaultView}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sort:</span>
                <Badge variant="outline" className="text-xs">
                  {preferences.competition.defaultSort.replace('_', ' ')}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Refresh:</span>
                <Badge variant="outline" className="text-xs">
                  {preferences.competition.autoRefreshInterval}s
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Live Updates:</span>
                <Badge variant={preferences.competition.enableLiveUpdates ? "default" : "outline"} className="text-xs">
                  {preferences.competition.enableLiveUpdates ? 'On' : 'Off'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Data Preferences */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="h-4 w-4" />
                Data & Sync
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sync Mode:</span>
                <Badge variant="outline" className="text-xs">
                  {preferences.data.syncMode}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cache:</span>
                <Badge variant="outline" className="text-xs">
                  {preferences.data.cacheStrategy}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bandwidth:</span>
                <Badge variant="outline" className="text-xs">
                  {preferences.data.bandwidthMode}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Offline:</span>
                <Badge variant={preferences.data.enableOfflineMode ? "default" : "outline"} className="text-xs">
                  {preferences.data.enableOfflineMode ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Privacy Preferences */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="h-4 w-4" />
                Privacy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Presence:</span>
                <Badge variant={preferences.privacy.sharePresence ? "default" : "outline"} className="text-xs">
                  {preferences.privacy.sharePresence ? 'Shared' : 'Private'}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Online Status:</span>
                <Badge variant={preferences.privacy.showOnlineStatus ? "default" : "outline"} className="text-xs">
                  {preferences.privacy.showOnlineStatus ? 'Visible' : 'Hidden'}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Analytics:</span>
                <Badge variant={preferences.privacy.allowAnalytics ? "default" : "outline"} className="text-xs">
                  {preferences.privacy.allowAnalytics ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Crash Reports:</span>
                <Badge variant={preferences.privacy.enableCrashReporting ? "default" : "outline"} className="text-xs">
                  {preferences.privacy.enableCrashReporting ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Device Information */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4" />
                Device Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Version:</span>
                <Badge variant="outline" className="text-xs">
                  v{preferences.version}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Sync:</span>
                <Badge variant="outline" className="text-xs">
                  {preferences.lastSyncedAt.toLocaleTimeString()}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Conflicts:</span>
                <Badge variant={preferences.syncConflicts?.length ? "destructive" : "secondary"} className="text-xs">
                  {preferences.syncConflicts?.length || 0}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Overrides:</span>
                <Badge variant="outline" className="text-xs">
                  {Object.keys(preferences.deviceOverrides).length}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Try the Preferences System</CardTitle>
          <CardDescription>
            Open the preferences dialog to see the full feature set in action
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Button onClick={() => setDialogOpen(true)} className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Open Preferences
            </Button>
            
            <div className="text-sm text-muted-foreground">
              Changes are synchronized in real-time across all your devices
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Features Info */}
      <Alert>
        <Palette className="h-4 w-4" />
        <AlertDescription>
          <strong>Phase 6.4 Features:</strong> Cross-device sync, real-time updates, comprehensive theming, 
          notification management, privacy controls, and device management. All preferences are 
          automatically synchronized across your devices using Supabase real-time infrastructure.
        </AlertDescription>
      </Alert>

      <PreferencesDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}