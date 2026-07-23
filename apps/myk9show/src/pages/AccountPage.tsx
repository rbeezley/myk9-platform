import { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  CreditCard,
  Download,
  Lock,
  Loader2,
  Palette,
  RotateCcw,
  Trash2,
  User,
  HardDrive,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ThemeSelector } from '@/components/preferences/ThemeSelector';
import {
  applyFontScale,
  storeFontScale,
  FONT_SIZE_SCALES,
  applyLayoutDensity,
  storeLayoutDensity,
  applyReduceMotion,
  storeReduceMotion,
  applyHighContrast,
  storeHighContrast,
} from '@/context/themeClasses';
import { NotificationSettings } from '@/components/notifications/NotificationSettings';
import { SecuritySettings } from '@/components/preferences/SecuritySettings';
import { DataSettings } from '@/components/preferences/DataSettings';
import { InstallAppSettings } from '@/components/preferences/InstallAppSettings';
import { useAuthUser } from '@/hooks/useAuthUser';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { ProfileSection, BillingSection, DeleteSection } from './AccountPage.sections';
import type { Section, NavGroup } from './AccountPage.types';
import type { PreferencesUpdate } from '@/types/user-preferences';
import { FormSkeleton } from '@/components/common/SkeletonLoaders';

const NON_PREF_SECTIONS: ReadonlySet<Section> = new Set(['profile', 'billing', 'delete']);

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Your account',
    items: [
      { key: 'profile', label: 'Profile', icon: User },
      { key: 'billing', label: 'Plan & billing', icon: CreditCard },
    ],
  },
  {
    label: 'Display',
    items: [{ key: 'appearance', label: 'Appearance', icon: Palette }],
  },
  {
    label: 'Notifications',
    items: [{ key: 'notifications', label: 'Notifications', icon: Bell }],
  },
  {
    label: 'Security',
    items: [{ key: 'security', label: 'Security', icon: Lock }],
  },
  {
    label: 'Advanced settings',
    items: [
      { key: 'data', label: 'Storage', icon: HardDrive },
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
    updatePreferences,
    resetToDefaults,
  } = useUserPreferences(user?.id ?? null);
  const [resetLoading, setResetLoading] = useState(false);
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

  // Keep the applied/cached font scale derived from the loaded preference.
  // Without this, "Reset" only replaces the server-backed preference — the
  // localStorage cache that ThemeProvider re-applies on boot would keep the
  // previous scale (e.g. a stale 1.2 after resetting to Medium).
  useEffect(() => {
    const fontSize = preferences?.theme?.fontSize;
    if (!fontSize) return;
    const scale = FONT_SIZE_SCALES[fontSize] ?? '1.0';
    applyFontScale(scale);
    storeFontScale(scale);
  }, [preferences?.theme?.fontSize]);

  // Same rationale as the font-scale effect above, for the other
  // boot-hydrated appearance preferences: keep the applied class + localStorage
  // cache in sync with the loaded server preference, so server prefs win over
  // a stale cache and "Reset Theme Settings" actually reverts the applied
  // classes when the blob resets.
  useEffect(() => {
    const layoutDensity = preferences?.theme?.layoutDensity;
    if (!layoutDensity) return;
    applyLayoutDensity(layoutDensity);
    storeLayoutDensity(layoutDensity);
  }, [preferences?.theme?.layoutDensity]);

  useEffect(() => {
    const reduceMotion = preferences?.theme?.reduceMotion;
    if (reduceMotion === undefined) return;
    applyReduceMotion(reduceMotion);
    storeReduceMotion(reduceMotion);
  }, [preferences?.theme?.reduceMotion]);

  useEffect(() => {
    const highContrast = preferences?.theme?.highContrast;
    if (highContrast === undefined) return;
    applyHighContrast(highContrast);
    storeHighContrast(highContrast);
  }, [preferences?.theme?.highContrast]);

  const showFlash = useCallback((msg: string, kind: 'success' | 'error' = 'success') => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setFlash({ msg, kind });
    flashTimerRef.current = setTimeout(() => setFlash(null), kind === 'error' ? 5000 : 3000);
  }, []);

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
      try {
        setResetLoading(true);
        await resetToDefaults(category);
        showFlash(`${category ?? 'All preferences'} reset to defaults`);
      } catch (e) {
        showFlash(e instanceof Error ? e.message : 'Something went wrong', 'error');
      } finally {
        setResetLoading(false);
      }
    },
    [resetToDefaults, showFlash]
  );

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
      case 'appearance':
        return (
          <ThemeSelector
            preferences={preferences?.theme}
            onUpdate={t => handleUpdate({ theme: t })}
            onReset={() => handleReset('theme')}
          />
        );
      case 'notifications':
        return <NotificationSettings />;
      case 'billing':
        return <BillingSection />;
      case 'security':
        return <SecuritySettings />;
      case 'data':
        return <DataSettings />;
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

        {/* Rendered as a fixed overlay (not in normal flow) so the flash never
            shifts the nav/content layout below — see account-page-ux-remediation
            Decision 5: the banner previously inserted above the nav and shifted
            the whole layout down, causing misclicks. */}
        {flash && (
          <div
            data-testid="account-flash-overlay"
            className="fixed left-1/2 top-24 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2"
          >
            {flash.kind === 'success' ? (
              <Alert className="border-success/30 bg-success/10 text-success shadow-lg">
                <CheckCircle2 className="h-4 w-4 text-success " />
                <AlertDescription>{flash.msg}</AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive" className="shadow-lg">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{flash.msg}</AlertDescription>
              </Alert>
            )}
          </div>
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

            <div className="mt-3 border-t border-border/50 pt-3 md:mt-4 md:pt-4">
              <Button
                variant="ghost"
                className="min-h-11 w-full justify-center px-3 text-muted-foreground md:justify-start md:text-sm"
                onClick={() => handleReset()}
                disabled={resetLoading}
                title="Reset all settings"
              >
                {resetLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin md:mr-2" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5 md:mr-2" />
                )}
                <span className="sr-only md:not-sr-only">Reset all settings</span>
              </Button>
            </div>
          </nav>

          <div className="w-full min-w-0 md:flex-1">{renderSection()}</div>
        </div>
      </div>
    </div>
  );
}
