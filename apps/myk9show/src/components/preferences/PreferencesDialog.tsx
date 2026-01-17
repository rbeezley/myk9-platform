/**
 * Preferences Dialog Component
 * Phase 6.4: User Preferences & UI State
 * 
 * Main preferences management interface with tabs for different categories
 */

import { useState } from 'react';
import { 
  Settings, 
  Monitor, 
  Bell, 
  Wifi, 
  Shield, 
  Download, 
  Upload, 
  RotateCcw,
  X,
  AlertTriangle,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { useAuthUser } from '@/hooks/useAuthUser';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ThemeSelector } from './ThemeSelector';
import { NotificationSettings } from './NotificationSettings';
import { CompetitionSettings } from './CompetitionSettings';
import { DataSettings } from './DataSettings';
import { PrivacySettings } from './PrivacySettings';
import { DeviceManager } from './DeviceManager';
import { SyncStatusIndicator } from './SyncStatusIndicator';
import type { PreferencesUpdate } from '@/types/user-preferences';

interface PreferencesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type TabValue = 'theme' | 'notifications' | 'competition' | 'data' | 'privacy' | 'devices';

export function PreferencesDialog({ open, onOpenChange }: PreferencesDialogProps) {
  const user = useAuthUser();
  const {
    preferences,
    loading,
    error,
    syncState,
    devices,
    updatePreferences,
    resetToDefaults,
    exportPreferences,
    importPreferences,
    forceSync,
  } = useUserPreferences(user?.id || null);

  const [activeTab, setActiveTab] = useState<TabValue>('theme');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  /**
   * Handle preference updates
   */
  const handleUpdate = async (updates: PreferencesUpdate) => {
    try {
      setActionError(null);
      await updatePreferences(updates);
      setSuccessMessage('Preferences updated successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : 'Failed to update preferences');
    }
  };

  /**
   * Handle reset to defaults
   */
  const handleReset = async (category?: keyof PreferencesUpdate) => {
    try {
      setActionLoading('reset');
      setActionError(null);
      
      await resetToDefaults(category);
      setSuccessMessage(`${category ? `${category} preferences` : 'All preferences'} reset to defaults`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : 'Failed to reset preferences');
    } finally {
      setActionLoading(null);
    }
  };

  /**
   * Handle export preferences
   */
  const handleExport = async () => {
    try {
      setActionLoading('export');
      setActionError(null);
      
      const data = await exportPreferences();
      
      // Create download
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `myK9Show-preferences-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setSuccessMessage('Preferences exported successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : 'Failed to export preferences');
    } finally {
      setActionLoading(null);
    }
  };

  /**
   * Handle import preferences
   */
  const handleImport = async () => {
    try {
      setActionLoading('import');
      setActionError(null);
      
      // Create file input
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        
        try {
          const text = await file.text();
          await importPreferences(text);
          
          setSuccessMessage('Preferences imported successfully');
          setTimeout(() => setSuccessMessage(null), 3000);
        } catch (error: unknown) {
          setActionError(error instanceof Error ? error.message : 'Failed to import preferences');
        } finally {
          setActionLoading(null);
        }
      };
      
      input.click();
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : 'Failed to import preferences');
      setActionLoading(null);
    }
  };

  /**
   * Handle force sync
   */
  const handleForceSync = async () => {
    try {
      setActionLoading('sync');
      setActionError(null);
      
      await forceSync();
      setSuccessMessage('Preferences synchronized successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : 'Failed to sync preferences');
    } finally {
      setActionLoading(null);
    }
  };

  // Tab configuration
  const tabs = [
    {
      value: 'theme' as TabValue,
      label: 'Theme & Appearance',
      icon: Monitor,
      description: 'Customize the visual appearance and layout',
    },
    {
      value: 'notifications' as TabValue,
      label: 'Notifications',
      icon: Bell,
      description: 'Manage notification preferences and timing',
    },
    {
      value: 'competition' as TabValue,
      label: 'Competition',
      icon: Settings,
      description: 'Set defaults for competition views and filters',
    },
    {
      value: 'data' as TabValue,
      label: 'Data & Sync',
      icon: Wifi,
      description: 'Control data synchronization and performance',
    },
    {
      value: 'privacy' as TabValue,
      label: 'Privacy',
      icon: Shield,
      description: 'Manage privacy and data sharing settings',
    },
    {
      value: 'devices' as TabValue,
      label: 'Devices',
      icon: Monitor,
      description: 'Manage connected devices and sync status',
    },
  ];

  if (!user) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[90vw] h-[80vh] p-0 flex flex-col bg-gradient-to-br from-card to-card/80 border border-border/30 rounded-2xl backdrop-blur-xl">
        <DialogHeader className="px-6 py-4 border-b border-border/30 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-2xl font-semibold tracking-tight">
                Preferences
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Customize your myK9Show experience and sync across devices
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <SyncStatusIndicator syncState={syncState} compact />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Status Messages */}
        <div className="px-6 flex-shrink-0">
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {actionError && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          )}

          {successMessage && (
            <Alert className="mb-4 border-green-200 bg-green-50 text-green-800">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription>{successMessage}</AlertDescription>
            </Alert>
          )}
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
              <p className="text-sm text-muted-foreground">Loading preferences...</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex min-h-0">
            <Tabs
              value={activeTab}
              onValueChange={(value) => setActiveTab(value as TabValue)}
              className="flex-1 flex min-h-0"
            >
              {/* Sidebar Navigation */}
              <div className="w-64 border-r border-border/30 bg-muted/20">
                <TabsList className="flex flex-col h-full w-full justify-start bg-transparent p-2 space-y-1">
                  {tabs.map((tab) => (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className="w-full justify-start p-3 text-left data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm hover:bg-muted/40 transition-all duration-200"
                    >
                      <tab.icon className="h-4 w-4 mr-3 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{tab.label}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {tab.description}
                        </div>
                      </div>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              {/* Content Area */}
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto p-6 min-h-0">
                  <TabsContent value="theme" className="mt-0">
                    <ThemeSelector
                      preferences={preferences?.theme}
                      onUpdate={(theme) => handleUpdate({ theme })}
                      onReset={() => handleReset('theme')}
                    />
                  </TabsContent>

                  <TabsContent value="notifications" className="mt-0">
                    <NotificationSettings
                      preferences={preferences?.notifications}
                      onUpdate={(notifications) => handleUpdate({ notifications })}
                      onReset={() => handleReset('notifications')}
                    />
                  </TabsContent>

                  <TabsContent value="competition" className="mt-0">
                    <CompetitionSettings
                      preferences={preferences?.competition}
                      onUpdate={(competition) => handleUpdate({ competition })}
                      onReset={() => handleReset('competition')}
                    />
                  </TabsContent>

                  <TabsContent value="data" className="mt-0">
                    <DataSettings
                      preferences={preferences?.data}
                      onUpdate={(data) => handleUpdate({ data })}
                      onReset={() => handleReset('data')}
                    />
                  </TabsContent>

                  <TabsContent value="privacy" className="mt-0">
                    <PrivacySettings
                      preferences={preferences?.privacy}
                      onUpdate={(privacy) => handleUpdate({ privacy })}
                      onReset={() => handleReset('privacy')}
                    />
                  </TabsContent>

                  <TabsContent value="devices" className="mt-0">
                    <DeviceManager devices={devices} syncState={syncState} />
                  </TabsContent>
                </div>

                {/* Action Buttons */}
                <div className="border-t border-border/30 bg-muted/20 px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExport}
                        disabled={!!actionLoading}
                        className="hover:bg-primary/5"
                      >
                        {actionLoading === 'export' ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4 mr-2" />
                        )}
                        Export
                      </Button>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleImport}
                        disabled={!!actionLoading}
                        className="hover:bg-primary/5"
                      >
                        {actionLoading === 'import' ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4 mr-2" />
                        )}
                        Import
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleForceSync}
                        disabled={!!actionLoading}
                        className="hover:bg-primary/5"
                      >
                        {actionLoading === 'sync' ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Wifi className="h-4 w-4 mr-2" />
                        )}
                        Sync Now
                      </Button>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {devices.filter(d => d.isCurrentDevice).length > 0 ? 'Current Device' : 'Unknown Device'}
                      </Badge>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReset()}
                        disabled={!!actionLoading}
                        className="text-destructive hover:bg-destructive/5 hover:text-destructive"
                      >
                        {actionLoading === 'reset' ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <RotateCcw className="h-4 w-4 mr-2" />
                        )}
                        Reset All
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}