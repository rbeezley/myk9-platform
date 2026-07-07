import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { FormSkeleton } from '@/components/common/SkeletonLoaders';

type ActionKey = 'reset' | 'export' | 'import';

const NON_PREF_SECTIONS: ReadonlySet<Section> = new Set(['profile', 'dogs', 'delete']);

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Your account',
    items: [
      { key: 'profile', label: 'Profile', icon: User },
      { key: 'dogs', label: 'My dogs', icon: Dog },
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
    label: 'Advanced settings',
    items: [
      { key: 'data', label: 'Data & sync', icon: Wifi },
      { key: 'devices', label: 'Devices', icon: Smartphone },
      { key: 'install', label: 'Install app', icon: Download },
      { key: 'delete', label: 'Delete account', icon: Trash2 },
    ],
  },
];

function readSectionParam(searchParams: URLSearchParams): Section | null {
  const section = searchParams.get('section');
  if (!section) return null;
  return NAV_GROUPS.some(group => group.items.some(item => item.key === section))
    ? (section as Section)
    : null;
}

export default function AccountPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [active, setActive] = useState<Section>(() => readSectionParam(searchParams) ?? 'profile');
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

  useEffect(() => {
    const section = readSectionParam(searchParams);
    if (section && section !== active) setActive(section);
  }, [active, searchParams]);

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

  const handleSectionChange = useCallback(
    (section: Section) => {
      setActive(section);
      const nextParams = new URLSearchParams(searchParams);
      if (section === 'profile') {
        nextParams.delete('section');
      } else {
        nextParams.set('section', section);
      }
      setSearchParams(nextParams, { replace: true });
    },
    [searchParams, setSearchParams]
  );

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
        <div role="status" aria-label="Loading account preferences" className="py-4">
          <FormSkeleton />
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
          <Alert className="mb-4 border-success/30 bg-success/10 text-success ">
            <CheckCircle2 className="h-4 w-4 text-success " />
            <AlertDescription>{flash.msg}</AlertDescription>
          </Alert>
        )}
        {flash?.kind === 'error' && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{flash.msg}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-6 md:flex-row md:gap-8">
          <nav className="w-full md:w-52 md:shrink-0" aria-label="Account sections">
            <div className="-mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:overflow-visible md:px-0 md:pb-0">
              <div className="flex w-max gap-2 md:block md:w-auto">
                {NAV_GROUPS.map(group => (
                  <div key={group.label || 'danger'} className="contents md:mb-4 md:block">
                    {group.label && (
                      <p className="sr-only px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 md:not-sr-only">
                        {group.label}
                      </p>
                    )}
                    <ul className="contents md:block md:space-y-0.5">
                      {group.items.map(({ key, label, icon: Icon }) => (
                        <li key={key} className="contents md:block">
                          <button
                            onClick={() => handleSectionChange(key)}
                            aria-current={active === key ? 'page' : undefined}
                            className={`flex min-h-11 w-auto items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors md:w-full md:whitespace-normal ${
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
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/50 pt-3 md:mt-4 md:block md:space-y-1 md:pt-4">
              {actionButtons.map(({ key, label, Icon, action }) => (
                <Button
                  key={key}
                  variant="ghost"
                  className="min-h-11 justify-center px-3 text-muted-foreground md:w-full md:justify-start md:text-sm"
                  onClick={action}
                  disabled={!!actionLoading}
                  title={label}
                >
                  {actionLoading === key ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin md:mr-2" />
                  ) : (
                    <Icon className="h-3.5 w-3.5 md:mr-2" />
                  )}
                  <span className="sr-only md:not-sr-only">{label}</span>
                </Button>
              ))}
            </div>
          </nav>

          <div className="w-full min-w-0 md:flex-1">{renderSection()}</div>
        </div>
      </div>
    </div>
  );
}
