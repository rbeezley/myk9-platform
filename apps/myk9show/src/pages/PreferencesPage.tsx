/**
 * Preferences Page
 * Full page for user preferences with inline settings navigation
 */

import { useState } from 'react';
import {
  Settings,
  Monitor,
  Bell,
  Wifi,
  Shield,
  Lock,
  Download,
  Upload,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { useAuthUser } from '@/hooks/useAuthUser';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ThemeSelector } from '@/components/preferences/ThemeSelector';
import { NotificationSettings } from '@/components/notifications/NotificationSettings';
import { CompetitionSettings } from '@/components/preferences/CompetitionSettings';
import { DataSettings } from '@/components/preferences/DataSettings';
import { PrivacySettings } from '@/components/preferences/PrivacySettings';
import { SecuritySettings } from '@/components/preferences/SecuritySettings';
import { DeviceManager } from '@/components/preferences/DeviceManager';
import { SyncStatusIndicator } from '@/components/preferences/SyncStatusIndicator';
import type { PreferencesUpdate } from '@/types/user-preferences';

type TabValue =
  | 'theme'
  | 'notifications'
  | 'competition'
  | 'data'
  | 'privacy'
  | 'security'
  | 'devices';

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
    value: 'security' as TabValue,
    label: 'Security',
    icon: Lock,
    description: 'Change your password and security settings',
  },
  {
    value: 'devices' as TabValue,
    label: 'Devices',
    icon: Monitor,
    description: 'Manage connected devices and sync status',
  },
];

export function PreferencesPage() {
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

  // Mobile nav state
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
      setSuccessMessage(
        `${category ? `${category} preferences` : 'All preferences'} reset to defaults`
      );
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

      input.onchange = async e => {
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

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8 pt-24">
        <p className="text-muted-foreground">Please sign in to access preferences.</p>
      </div>
    );
  }

  // Sidebar content
  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold">Preferences</h2>
        <p className="text-xs text-muted-foreground mt-1">Customize your experience</p>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {tabs.map(tab => (
          <button
            key={tab.value}
            onClick={() => {
              setActiveTab(tab.value);
              setMobileNavOpen(false);
            }}
            className={cn(
              'w-full flex items-start gap-3 p-3 rounded-lg text-left transition-colors',
              activeTab === tab.value
                ? 'bg-primary/10 text-primary'
                : 'hover:bg-muted/50 text-foreground'
            )}
          >
            <tab.icon className="h-5 w-5 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{tab.label}</div>
              <div className="text-xs text-muted-foreground truncate">{tab.description}</div>
            </div>
          </button>
        ))}
      </nav>

      {/* Action Buttons */}
      <div className="p-4 border-t border-border space-y-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={!!actionLoading}
          className="w-full justify-start"
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
          className="w-full justify-start"
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
          className="w-full justify-start"
        >
          {actionLoading === 'sync' ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Wifi className="h-4 w-4 mr-2" />
          )}
          Sync Now
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => handleReset()}
          disabled={!!actionLoading}
          className="w-full justify-start text-destructive hover:bg-destructive/5 hover:text-destructive"
        >
          {actionLoading === 'reset' ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RotateCcw className="h-4 w-4 mr-2" />
          )}
          Reset All
        </Button>

        <div className="pt-2">
          <Badge variant="outline" className="text-xs">
            {devices.filter(d => d.isCurrentDevice).length > 0
              ? 'Current Device'
              : 'Unknown Device'}
          </Badge>
        </div>
      </div>
    </div>
  );

  // Render the active tab content
  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-20">
          <div className="text-center space-y-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">Loading preferences...</p>
          </div>
        </div>
      );
    }

    switch (activeTab) {
      case 'theme':
        return (
          <ThemeSelector
            preferences={preferences?.theme}
            onUpdate={theme => handleUpdate({ theme })}
            onReset={() => handleReset('theme')}
          />
        );
      case 'notifications':
        return <NotificationSettings />;
      case 'competition':
        return (
          <CompetitionSettings
            preferences={preferences?.competition}
            onUpdate={competition => handleUpdate({ competition })}
            onReset={() => handleReset('competition')}
          />
        );
      case 'data':
        return (
          <DataSettings
            preferences={preferences?.data}
            onUpdate={data => handleUpdate({ data })}
            onReset={() => handleReset('data')}
          />
        );
      case 'privacy':
        return (
          <PrivacySettings
            preferences={preferences?.privacy}
            onUpdate={privacy => handleUpdate({ privacy })}
            onReset={() => handleReset('privacy')}
          />
        );
      case 'security':
        return <SecuritySettings />;
      case 'devices':
        return <DeviceManager devices={devices} syncState={syncState} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-0">
      {/* Settings nav — desktop: fixed left column, mobile: collapsible */}
      <aside className="hidden md:block w-[260px] flex-shrink-0 border-r border-border/30 overflow-y-auto">
        {sidebarContent}
      </aside>

      {/* Mobile nav toggle */}
      <div className="md:hidden p-4 border-b border-border">
        <Button variant="ghost" size="sm" onClick={() => setMobileNavOpen(!mobileNavOpen)}>
          <Settings className="h-4 w-4 mr-2" />
          {tabs.find(t => t.value === activeTab)?.label}
        </Button>
        {mobileNavOpen && (
          <div className="mt-2 border rounded-lg border-border bg-card">{sidebarContent}</div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        {/* Header with sync status */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {tabs.find(t => t.value === activeTab)?.label}
            </h1>
            <p className="text-muted-foreground">
              {tabs.find(t => t.value === activeTab)?.description}
            </p>
          </div>
          <SyncStatusIndicator syncState={syncState} compact />
        </div>

        {/* Status Messages */}
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
          <Alert className="mb-4 border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        )}

        {/* Tab Content */}
        {renderContent()}
      </div>
    </div>
  );
}

export default PreferencesPage;
