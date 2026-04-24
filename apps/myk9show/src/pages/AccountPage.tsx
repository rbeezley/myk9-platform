import { useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Dog,
  Download,
  Lock,
  Loader2,
  Palette,
  RotateCcw,
  Shield,
  SlidersHorizontal,
  Smartphone,
  Trash2,
  Upload,
  User,
  Wifi,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ThemeSelector } from '@/components/preferences/ThemeSelector';
import { NotificationSettings } from '@/components/notifications/NotificationSettings';
import { GeneralSettings } from '@/components/preferences/GeneralSettings';
import { PrivacySettings } from '@/components/preferences/PrivacySettings';
import { SecuritySettings } from '@/components/preferences/SecuritySettings';
import { DataSettings } from '@/components/preferences/DataSettings';
import { DeviceManager } from '@/components/preferences/DeviceManager';
import { InstallAppSettings } from '@/components/preferences/InstallAppSettings';
import { useAuthUser } from '@/hooks/useAuthUser';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { ProfileSection, DogsSection, DeleteSection } from './AccountPage.sections';
import type { Section, NavGroup } from './AccountPage.types';
import type { PreferencesUpdate } from '@/types/user-preferences';

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Your account',
    items: [
      { key: 'profile', label: 'Profile', icon: User },
      { key: 'dogs', label: 'Linked dogs', icon: Dog },
    ],
  },
  {
    label: 'Display',
    items: [
      { key: 'appearance', label: 'Appearance', icon: Palette },
      { key: 'general', label: 'General', icon: SlidersHorizontal },
    ],
  },
  {
    label: 'Notifications',
    items: [{ key: 'notifications', label: 'Notifications', icon: Bell }],
  },
  {
    label: 'Privacy & security',
    items: [
      { key: 'privacy', label: 'Privacy', icon: Shield },
      { key: 'security', label: 'Security', icon: Lock },
    ],
  },
  {
    label: 'Advanced',
    items: [
      { key: 'data', label: 'Data & sync', icon: Wifi },
      { key: 'devices', label: 'Devices', icon: Smartphone },
      { key: 'install', label: 'Install app', icon: Download },
    ],
  },
  {
    label: '',
    items: [{ key: 'delete', label: 'Delete account', icon: Trash2 }],
  },
];

const PREF_SECTIONS: Section[] = [
  'appearance',
  'general',
  'notifications',
  'privacy',
  'security',
  'data',
  'devices',
  'install',
];

export default function AccountPage() {
  const [active, setActive] = useState<Section>('profile');
  const user = useAuthUser();
  const {
    preferences,
    loading: prefsLoading,
    syncState,
    devices,
    updatePreferences,
    resetToDefaults,
    exportPreferences,
    importPreferences,
  } = useUserPreferences(user?.id ?? null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const flash = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };
  const flashErr = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 5000);
  };

  const handleUpdate = async (updates: PreferencesUpdate) => {
    try {
      await updatePreferences(updates);
      flash('Saved');
    } catch (e) {
      flashErr(e instanceof Error ? e.message : 'Failed to save');
    }
  };

  const handleReset = async (category?: keyof PreferencesUpdate) => {
    try {
      setActionLoading('reset');
      await resetToDefaults(category);
      flash(`${category ?? 'All preferences'} reset to defaults`);
    } catch (e) {
      flashErr(e instanceof Error ? e.message : 'Failed to reset');
    } finally {
      setActionLoading(null);
    }
  };

  const handleExport = async () => {
    try {
      setActionLoading('export');
      const data = await exportPreferences();
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(new Blob([data], { type: 'application/json' })),
        download: `myK9Show-prefs-${new Date().toISOString().slice(0, 10)}.json`,
      });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      flash('Exported');
    } catch (e) {
      flashErr(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleImport = () => {
    const input = Object.assign(document.createElement('input'), {
      type: 'file',
      accept: '.json',
    });
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        setActionLoading('import');
        await importPreferences(await file.text());
        flash('Imported');
      } catch (err) {
        flashErr(err instanceof Error ? err.message : 'Import failed');
      } finally {
        setActionLoading(null);
      }
    };
    input.click();
  };

  const renderSection = () => {
    if (PREF_SECTIONS.includes(active) && prefsLoading) {
      return (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }
    switch (active) {
      case 'profile':
        return <ProfileSection />;
      case 'dogs':
        return <DogsSection />;
      case 'appearance':
        return (
          <ThemeSelector
            preferences={preferences?.theme}
            onUpdate={t => handleUpdate({ theme: t })}
            onReset={() => handleReset('theme')}
          />
        );
      case 'general':
        return <GeneralSettings />;
      case 'notifications':
        return <NotificationSettings />;
      case 'privacy':
        return (
          <PrivacySettings
            preferences={preferences?.privacy}
            onUpdate={p => handleUpdate({ privacy: p })}
            onReset={() => handleReset('privacy')}
          />
        );
      case 'security':
        return <SecuritySettings />;
      case 'data':
        return (
          <DataSettings
            preferences={preferences?.data}
            onUpdate={d => handleUpdate({ data: d })}
            onReset={() => handleReset('data')}
          />
        );
      case 'devices':
        return <DeviceManager devices={devices} syncState={syncState} />;
      case 'install':
        return <InstallAppSettings />;
      case 'delete':
        return <DeleteSection />;
      default: {
        const _exhaustive: never = active;
        return _exhaustive;
      }
    }
  };

  return (
    <div className="min-h-screen bg-background pt-20">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-2xl font-bold mb-8">Account</h1>

        {successMsg && (
          <Alert className="mb-4 border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            <AlertDescription>{successMsg}</AlertDescription>
          </Alert>
        )}
        {errorMsg && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{errorMsg}</AlertDescription>
          </Alert>
        )}

        <div className="flex gap-8">
          {/* Left rail */}
          <nav className="w-52 shrink-0">
            {NAV_GROUPS.map(group => (
              <div key={group.label || 'danger'} className="mb-4">
                {group.label && (
                  <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    {group.label}
                  </p>
                )}
                <ul className="space-y-0.5">
                  {group.items.map(({ key, label, icon: Icon }) => (
                    <li key={key}>
                      <button
                        onClick={() => setActive(key)}
                        className={`w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                          active === key
                            ? key === 'delete'
                              ? 'bg-destructive/10 text-destructive font-medium'
                              : 'bg-primary/10 text-primary font-medium'
                            : key === 'delete'
                              ? 'text-destructive/70 hover:bg-destructive/5 hover:text-destructive'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {/* Preference actions */}
            <div className="mt-4 pt-4 border-t border-border/50 space-y-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-muted-foreground text-xs"
                onClick={handleExport}
                disabled={!!actionLoading}
              >
                {actionLoading === 'export' ? (
                  <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5 mr-2" />
                )}
                Export settings
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-muted-foreground text-xs"
                onClick={handleImport}
                disabled={!!actionLoading}
              >
                {actionLoading === 'import' ? (
                  <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5 mr-2" />
                )}
                Import settings
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-muted-foreground text-xs"
                onClick={() => handleReset()}
                disabled={!!actionLoading}
              >
                {actionLoading === 'reset' ? (
                  <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5 mr-2" />
                )}
                Reset all settings
              </Button>
            </div>
          </nav>

          {/* Content */}
          <div className="flex-1 min-w-0">{renderSection()}</div>
        </div>
      </div>
    </div>
  );
}
