import { useState, useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
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
  WifiOff,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ThemeSelector } from '@/components/preferences/ThemeSelector';
import {
  applyFontScale,
  storeFontScale,
  FONT_SIZE_SCALES,
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
import { useTheme } from '@/hooks/useTheme';
import { useApplyServerTheme } from '@/hooks/useApplyServerTheme';
import { useOnlineStatus } from '@/lib/networkUtils';
import { NEEDS_CONNECTION_MESSAGE, useUserPreferences } from '@/hooks/useUserPreferences';
import { logger } from '@/services/LoggingService';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { ProfileSection, BillingSection, DeleteSection } from './AccountPage.sections';
import {
  ACCOUNT_PHONE_QUERY,
  AccountSectionBack,
  AccountSectionList,
} from './AccountPage.phoneNav';
import type { Section, NavGroup } from './AccountPage.types';
import type { PreferencesUpdate } from '@/types/user-preferences';
import { FormSkeleton } from '@/components/common/SkeletonLoaders';

const NON_PREF_SECTIONS: ReadonlySet<Section> = new Set(['profile', 'billing', 'delete']);

// These sections read or write the server directly (profile, plan, auth, deletion),
// so offline they say so instead of failing a save. Appearance and Notifications
// (sound, voice, haptics) are device settings and stay usable offline (MYK9-1545).
const ONLINE_ONLY_SECTIONS: ReadonlySet<Section> = new Set([
  'profile',
  'billing',
  'security',
  'delete',
]);

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

const SETTING_SAVE_FAILED = "We couldn't save that setting. Try again.";
const SETTING_RESET_FAILED = "We couldn't reset your settings. Try again.";
const SETTING_NEEDS_CONNECTION = 'That needs a connection. Connect to the internet and try again.';

/**
 * The only error `useUserPreferences` words on purpose is the offline refusal, known by its
 * constant. Anything else is a database or library error and never reaches the screen.
 */
function preferenceFailureMessage(error: unknown, fixed: string): string {
  return error instanceof Error && error.message === NEEDS_CONNECTION_MESSAGE
    ? SETTING_NEEDS_CONNECTION
    : fixed;
}

function readSectionParam(searchParams: URLSearchParams): Section | null {
  const section = searchParams.get('section');
  if (!section) return null;
  return NAV_GROUPS.some(group => group.items.some(item => item.key === section))
    ? (section as Section)
    : null;
}

export default function AccountPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [active, setActive] = useState<Section>(() => readSectionParam(searchParams) ?? 'profile');
  const isPhone = useMediaQuery(ACCOUNT_PHONE_QUERY);
  // On a phone, the bare /account URL is the section list; a section param
  // (deep link or a tapped row) opens that section with a Back control.
  const showPhoneList = isPhone && readSectionParam(searchParams) === null;
  const phoneSectionOpen = isPhone && !showPhoneList;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const phoneViewKey = isPhone ? (showPhoneList ? 'list' : `section:${active}`) : null;
  const previousPhoneViewKey = useRef(phoneViewKey);

  // Moving between the phone list and a section swaps the whole view in place:
  // start it at the top (the list scrolls on a short phone) and move focus to
  // its title, since the row or Back button that had focus just unmounted.
  useEffect(() => {
    if (previousPhoneViewKey.current === phoneViewKey) return;
    const wasPhoneView = previousPhoneViewKey.current !== null;
    previousPhoneViewKey.current = phoneViewKey;
    if (phoneViewKey === null || !wasPhoneView) return;
    window.scrollTo(0, 0);
    headingRef.current?.focus({ preventScroll: true });
  }, [phoneViewKey]);
  const user = useAuthUser();
  const isOnline = useOnlineStatus();
  const { mode } = useTheme();
  // A newer server value (another device) replaced this device's: apply it live.
  const applyServerTheme = useApplyServerTheme();
  const {
    preferences,
    loading: prefsLoading,
    updatePreferences,
    resetToDefaults,
  } = useUserPreferences(user?.id ?? null, applyServerTheme);
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
    // An absent/invalid section param means the base /account URL — fall back
    // to 'profile' so external navigation that drops the param (e.g. the
    // account-menu "Account" link opened while this page is already mounted)
    // doesn't leave a stale section like billing selected.
    const section = readSectionParam(searchParams) ?? 'profile';
    if (section !== active) setActive(section);
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
        logger.error('Error saving preferences', 'account', {}, e as Error);
        showFlash(preferenceFailureMessage(e, SETTING_SAVE_FAILED), 'error');
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
        logger.error('Error resetting preferences', 'account', {}, e as Error);
        showFlash(preferenceFailureMessage(e, SETTING_RESET_FAILED), 'error');
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
      if (section === 'profile' && !isPhone) {
        nextParams.delete('section');
      } else {
        nextParams.set('section', section);
      }
      // A phone pushes so the device's own Back button returns to the list.
      setSearchParams(
        nextParams,
        isPhone ? { state: { fromAccountList: true } } : { replace: true }
      );
    },
    [isPhone, searchParams, setSearchParams]
  );

  const handlePhoneBack = useCallback(() => {
    const state = location.state as { fromAccountList?: boolean } | null;
    if (state?.fromAccountList) {
      navigate(-1);
      return;
    }
    // Arrived by deep link: there is no list entry behind us to go back to.
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('section');
    setSearchParams(nextParams, { replace: true });
  }, [location.state, navigate, searchParams, setSearchParams]);

  const resetButton = (
    <Button
      variant="ghost"
      className="min-h-11 w-full justify-center px-3 text-muted-foreground md:justify-start md:text-sm"
      onClick={() => handleReset()}
      disabled={resetLoading || !isOnline}
      title={isOnline ? 'Reset all settings' : 'Needs a connection'}
    >
      {resetLoading ? (
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
      ) : (
        <RotateCcw className="mr-2 h-3.5 w-3.5" />
      )}
      Reset all settings
    </Button>
  );

  const activeLabel =
    NAV_GROUPS.flatMap(group => group.items).find(item => item.key === active)?.label ?? 'Account';

  const renderSection = () => {
    if (!NON_PREF_SECTIONS.has(active) && prefsLoading) {
      return (
        <div role="status" aria-label="Loading account preferences" className="py-4">
          <FormSkeleton />
        </div>
      );
    }
    if (!isOnline && ONLINE_ONLY_SECTIONS.has(active)) {
      return (
        <Alert role="status" data-testid="account-needs-connection">
          <WifiOff className="h-4 w-4" />
          <AlertDescription>
            Needs a connection. This section is available again once you are back online.
          </AlertDescription>
        </Alert>
      );
    }
    switch (active) {
      case 'profile':
        return <ProfileSection />;
      case 'appearance':
        return (
          <ThemeSelector
            preferences={preferences?.theme ? { ...preferences.theme, mode } : undefined}
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
    // The app shell already clears the fixed header; the old pt-20 here stacked
    // ~110px of empty space above the title (MYK9-1717).
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl px-4 py-4 md:py-8">
        {phoneSectionOpen && <AccountSectionBack onBack={handlePhoneBack} />}
        <h1 ref={headingRef} tabIndex={-1} className="mb-4 text-2xl font-bold outline-none md:mb-8">
          {phoneSectionOpen ? activeLabel : 'Account'}
        </h1>

        {/* Rendered as a fixed overlay (not in normal flow) so the flash never
            shifts the nav/content layout below — see account-page-ux-remediation
            Decision 5: the banner previously inserted above the nav and shifted
            the whole layout down, causing misclicks. */}
        {flash && (
          <div
            data-testid="account-flash-overlay"
            className="fixed left-1/2 top-[calc(var(--app-top-inset,3rem)+0.5rem)] z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2"
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

        {isPhone ? (
          showPhoneList ? (
            <>
              <AccountSectionList groups={NAV_GROUPS} onSelect={handleSectionChange} />
              <div className="mt-4">{resetButton}</div>
            </>
          ) : (
            renderSection()
          )
        ) : (
          // Tablet and desktop (768px and up): the sidebar of sections.
          <div className="flex flex-row gap-8">
            <nav className="w-52 shrink-0" aria-label="Account sections">
              {NAV_GROUPS.map(group => (
                <div key={group.label} className="mb-4">
                  <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </p>
                  <ul className="space-y-0.5">
                    {group.items.map(({ key, label, icon: Icon }) => (
                      <li key={key}>
                        <button
                          onClick={() => handleSectionChange(key)}
                          aria-current={active === key ? 'page' : undefined}
                          className={`flex min-h-11 w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
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

              <div className="border-t border-border/50 pt-4">{resetButton}</div>
            </nav>

            <div className="min-w-0 flex-1">{renderSection()}</div>
          </div>
        )}
      </div>
    </div>
  );
}
