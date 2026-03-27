/**
 * Preferences Page
 * Full page for user preferences with inline settings navigation
 */

import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
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
  SlidersHorizontal,
  Volume2,
  Trophy,
  Download as DownloadIcon,
  Smartphone,
} from 'lucide-react';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { useAuthUser } from '@/hooks/useAuthUser';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
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
import { GeneralSettings } from '@/components/preferences/GeneralSettings';
import { ScoringSettings } from '@/components/preferences/ScoringSettings';
import { InstallAppSettings } from '@/components/preferences/InstallAppSettings';
import type { PreferencesUpdate } from '@/types/user-preferences';

type TabValue =
  | 'theme'
  | 'general'
  | 'notifications'
  | 'scoring'
  | 'competition'
  | 'privacy'
  | 'security'
  | 'data'
  | 'devices'
  | 'install';

interface SettingsSection {
  id: TabValue;
  label: string;
  icon: LucideIcon;
  description: string;
  roleRequired?: UserRole[];
}

interface SettingsGroup {
  id: string;
  label: string;
  sections: SettingsSection[];
}

const settingsGroups: SettingsGroup[] = [
  {
    id: 'appearance',
    label: 'Appearance',
    sections: [
      {
        id: 'theme',
        label: 'Theme & Display',
        icon: Monitor,
        description: 'Customize colors, layout, and visual preferences',
      },
      {
        id: 'general',
        label: 'General',
        icon: SlidersHorizontal,
        description: 'App behavior and interaction preferences',
      },
    ],
  },
  {
    id: 'alerts',
    label: 'Alerts & Sound',
    sections: [
      {
        id: 'notifications',
        label: 'Notifications',
        icon: Bell,
        description: 'Manage notification preferences and timing',
      },
      {
        id: 'scoring',
        label: 'Scoring',
        icon: Volume2,
        description: 'Voice announcements and audio during scoring',
        roleRequired: [UserRole.JUDGE, UserRole.SECRETARY, UserRole.STEWARD, UserRole.SITE_ADMIN],
      },
    ],
  },
  {
    id: 'events',
    label: 'Events',
    sections: [
      {
        id: 'competition',
        label: 'Competition',
        icon: Trophy,
        description: 'Set defaults for competition views and filters',
      },
    ],
  },
  {
    id: 'account',
    label: 'Account & Data',
    sections: [
      {
        id: 'privacy',
        label: 'Privacy',
        icon: Shield,
        description: 'Manage privacy and data sharing settings',
      },
      {
        id: 'security',
        label: 'Security',
        icon: Lock,
        description: 'Change your password and security settings',
      },
      {
        id: 'data',
        label: 'Data & Sync',
        icon: Wifi,
        description: 'Control data synchronization and performance',
      },
      {
        id: 'devices',
        label: 'Devices',
        icon: Smartphone,
        description: 'Manage connected devices and sync status',
      },
      {
        id: 'install',
        label: 'Install App',
        icon: DownloadIcon,
        description: 'Add myK9Show to your home screen',
      },
    ],
  },
];

export function PreferencesPage() {
  const user = useAuthUser();
  const { hasRole } = useAuthContext();
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
  const [, setMobileNavOpen] = useState(false);

  const visibleGroups = settingsGroups
    .map(group => ({
      ...group,
      sections: group.sections.filter(
        section => !section.roleRequired || section.roleRequired.some(role => hasRole(role))
      ),
    }))
    .filter(group => group.sections.length > 0);

  const activeSection = visibleGroups.flatMap(g => g.sections).find(s => s.id === activeTab);

  const activeGroupId =
    visibleGroups.find(g => g.sections.some(s => s.id === activeTab))?.id || visibleGroups[0]?.id;

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
      <nav className="flex-1 overflow-y-auto p-2 space-y-4">
        {visibleGroups.map(group => (
          <div key={group.id}>
            <div className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.sections.map(section => (
                <button
                  key={section.id}
                  onClick={() => {
                    setActiveTab(section.id);
                    setMobileNavOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors text-sm',
                    activeTab === section.id
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'hover:bg-muted/50 text-foreground'
                  )}
                >
                  <section.icon className="h-4 w-4 flex-shrink-0" />
                  <span>{section.label}</span>
                </button>
              ))}
            </div>
          </div>
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
      case 'general':
        return <GeneralSettings />;
      case 'notifications':
        return <NotificationSettings />;
      case 'scoring':
        return <ScoringSettings />;
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
      case 'install':
        return <InstallAppSettings />;
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

      {/* Mobile nav */}
      <div className="md:hidden border-b border-border">
        {/* Group pills */}
        <div className="flex gap-1 px-4 pt-3 pb-2 overflow-x-auto">
          {visibleGroups.map(group => (
            <button
              key={group.id}
              onClick={() => setActiveTab(group.sections[0].id)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
                activeGroupId === group.id
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted/50 text-muted-foreground'
              )}
            >
              {group.label}
            </button>
          ))}
        </div>
        {/* Section chips within active group */}
        {(() => {
          const activeGroup = visibleGroups.find(g => g.id === activeGroupId);
          if (!activeGroup || activeGroup.sections.length <= 1) return null;
          return (
            <div className="flex gap-1.5 px-4 pb-3 overflow-x-auto">
              {activeGroup.sections.map(section => (
                <button
                  key={section.id}
                  onClick={() => setActiveTab(section.id)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs whitespace-nowrap transition-colors border',
                    activeTab === section.id
                      ? 'border-primary/30 bg-primary/10 text-primary font-medium'
                      : 'border-border bg-background text-muted-foreground'
                  )}
                >
                  {section.label}
                </button>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        {/* Header with sync status */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{activeSection?.label}</h1>
            <p className="text-muted-foreground">{activeSection?.description}</p>
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
