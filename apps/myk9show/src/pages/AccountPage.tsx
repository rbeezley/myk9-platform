import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
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
import { downloadFile } from '@/lib/export';
import { ProfileSection, DogsSection, DeleteSection } from './AccountPage.sections';
import type { Section, NavGroup } from './AccountPage.types';
import type { PreferencesUpdate } from '@/types/user-preferences';

type ActionKey = 'reset' | 'export' | 'import';

const NON_PREF_SECTIONS: ReadonlySet<Section> = new Set(['profile', 'dogs', 'delete']);

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
  const [actionLoading, setActionLoading] = useState<ActionKey | null>(null);
  const [flash, setFlash] = useState<{ msg: string; kind: 'success' | 'error' } | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    },
    []
  );

  const showFlash = useCallback((msg: string, kind: 'success' | 'error' = 'success') => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setFlash({ msg, kind });
    flashTimerRef.current = setTimeout(() => setFlash(null), kind === 'error' ? 5000 : 3000);
  }, []);

  const withAction = useCallback(
    async (key: ActionKey, fn: () => Promise<void>) => {
      try {
        setActionLoading(key);
        await fn();
      } catch (e) {
        showFlash(e instanceof Error ? e.message : 'Something went wrong', 'error');
      } finally {
        setActionLoading(null);
      }
    },
    [showFlash]
  );

  const handleUpdate = useCallback(
    async (updates: PreferencesUpdate) => {
      try {
        await updatePreferences(updates);
        showFlash('Saved');
      } catch (e) {
        showFlash(e instanceof Error ? e.message : 'Failed to save', 'error');
      }
    },
    [updatePreferences, showFlash]
  );

  const handleReset = useCallback(
    async (category?: keyof PreferencesUpdate) => {
      await withAction('reset', async () => {
        await resetToDefaults(category);
        showFlash(`${category ?? 'All preferences'} reset to defaults`);
      });
    },
    [withAction, resetToDefaults, showFlash]
  );

  const handleExport = useCallback(async () => {
    await withAction('export', async () => {
      const data = await exportPreferences();
      downloadFile(
        data,
        `myK9Show-prefs-${new Date().toISOString().slice(0, 10)}.json`,
        'application/json'
      );
      showFlash('Exported');
    });
  }, [withAction, exportPreferences, showFlash]);

  const handleImport = useCallback(() => {
    const input = Object.assign(document.createElement('input'), {
      type: 'file',
      accept: '.json',
    });
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        setActionLoading(null);
        return;
      }
      await withAction('import', async () => {
        await importPreferences(await file.text());
        showFlash('Imported');
      });
    };
    input.addEventListener('cancel', () => setActionLoading(null));
    setActionLoading('import');
    input.click();
  }, [withAction, importPreferences, showFlash]);

  const actionButtons = useMemo(
    () => [
      {
        key: 'export' as ActionKey,
        label: 'Export settings',
        Icon: Download,
        action: handleExport,
      },
      { key: 'import' as ActionKey, label: 'Import settings', Icon: Upload, action: handleImport },
      {
        key: 'reset' as ActionKey,
        label: 'Reset all settings',
        Icon: RotateCcw,
        action: () => handleReset(),
      },
    ],
    [handleExport, handleImport, handleReset]
  );

  const renderSection = () => {
    if (!NON_PREF_SECTIONS.has(active) && prefsLoading) {
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

        {flash?.kind === 'success' && (
          <Alert className="mb-4 border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            <AlertDescription>{flash.msg}</AlertDescription>
          </Alert>
        )}
        {flash?.kind === 'error' && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{flash.msg}</AlertDescription>
          </Alert>
        )}

        <div className="flex gap-8">
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
                        aria-current={active === key ? 'page' : undefined}
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

            <div className="mt-4 pt-4 border-t border-border/50 space-y-1">
              {actionButtons.map(({ key, label, Icon, action }) => (
                <Button
                  key={key}
                  variant="ghost"
                  className="min-h-11 w-full justify-start text-muted-foreground text-sm"
                  onClick={action}
                  disabled={!!actionLoading}
                >
                  {actionLoading === key ? (
                    <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                  ) : (
                    <Icon className="h-3.5 w-3.5 mr-2" />
                  )}
                  {label}
                </Button>
              ))}
            </div>
          </nav>

          <div className="flex-1 min-w-0">{renderSection()}</div>
        </div>
      </div>
    </div>
  );
}
