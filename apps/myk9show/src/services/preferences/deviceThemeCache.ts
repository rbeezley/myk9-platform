/**
 * Device copy of the theme preferences (MYK9-1545).
 *
 * Theme, font size, motion and contrast only affect this device, so they are
 * written here first and applied at once; the server blob is a sync target, not
 * a gate. Settings must open and change offline at the ringside.
 *
 * Conflict rule (last write wins, per field): each locally changed field records
 * when it changed and stays "pending" until the server accepted it. The server
 * blob keeps the same per-field time (`themeChangedAt`), so an unrelated
 * preference change on another device cannot outrank a field it did not touch.
 * On sync, a pending field NEWER than the server's time for that field is
 * pushed; a pending field that is older, and every non-pending field, takes the
 * server's value. A server row from before per-field times falls back to the
 * row's `updated_at`. A server field this device does not hold is applied too.
 */
import { DEFAULT_THEME_PREFERENCES, type ThemePreferences } from '@/types/user-preferences';
import { readStoredMode } from '@/context/themeUtils';
import {
  FONT_SIZE_SCALES,
  getStoredFontScale,
  getStoredHighContrast,
  getStoredReduceMotion,
} from '@/context/themeClasses';
import { useSettingsStore } from '@/store/settingsStore';

type ThemeField = keyof ThemePreferences;

export interface DeviceThemeCache {
  theme: Partial<ThemePreferences>;
  changedAt: Partial<Record<ThemeField, number>>;
  pending: ThemeField[];
}

const keyFor = (userId: string) => `myk9-device-theme-prefs:${userId}`;

export const THEME_FIELDS = Object.keys(DEFAULT_THEME_PREFERENCES) as ThemeField[];

export function readDeviceTheme(userId: string): DeviceThemeCache | null {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DeviceThemeCache>;
    return {
      theme: parsed.theme ?? {},
      changedAt: parsed.changedAt ?? {},
      pending: (parsed.pending ?? []).filter(f => THEME_FIELDS.includes(f)),
    };
  } catch {
    return null;
  }
}

export function writeDeviceTheme(userId: string, cache: DeviceThemeCache): void {
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(cache));
  } catch {
    // Storage full or blocked: the in-memory value still applies this session.
  }
}

/** Record local edits: applied value, change time, and pending until the server confirms. */
export function recordLocalThemeChange(
  userId: string,
  changes: Partial<ThemePreferences>,
  now: number = Date.now()
): DeviceThemeCache {
  const cache = readDeviceTheme(userId) ?? { theme: {}, changedAt: {}, pending: [] };
  const fields = Object.keys(changes) as ThemeField[];
  const next: DeviceThemeCache = {
    theme: { ...cache.theme, ...changes },
    changedAt: { ...cache.changedAt, ...Object.fromEntries(fields.map(f => [f, now])) },
    pending: [...new Set([...cache.pending, ...fields])],
  };
  writeDeviceTheme(userId, next);
  return next;
}

/** The device's theme: defaults overlaid with what this device last held. */
export function deviceThemeOrDefaults(cache: DeviceThemeCache | null): ThemePreferences {
  return { ...DEFAULT_THEME_PREFERENCES, ...(cache?.theme ?? {}) };
}

/** The font size a stored scale stands for, read off the canonical map ('1.0' is medium). */
function fontSizeForScale(scale: string | null): ThemePreferences['fontSize'] {
  const match = Object.entries(FONT_SIZE_SCALES).find(
    ([size, value]) => value === scale && size !== 'small'
  );
  return (
    (match?.[0] as ThemePreferences['fontSize'] | undefined) ?? DEFAULT_THEME_PREFERENCES.fontSize
  );
}

/** Pending time for a seeded field: beats a never-saved row (epoch 0), loses to any saved value. */
const SEEDED_CHANGED_AT = 1;

/**
 * First device copy for a user with none (MYK9-1568): the values this device is
 * already showing, from the stored font scale, motion and contrast, the theme
 * mode and the settings-store accent. Fields with no local value take defaults.
 * A field that differs from the default is pending at a time older than any
 * saved server value, so it survives when the server has nothing, and a saved
 * server value still wins.
 */
export function seedDeviceTheme(userId: string): DeviceThemeCache {
  const scale = getStoredFontScale();
  const theme: ThemePreferences = {
    mode: readStoredMode(),
    colorScheme: useSettingsStore.getState().settings.accentColor,
    fontSize: fontSizeForScale(scale),
    reduceMotion: getStoredReduceMotion() ?? DEFAULT_THEME_PREFERENCES.reduceMotion,
    highContrast: getStoredHighContrast() ?? DEFAULT_THEME_PREFERENCES.highContrast,
  };
  const pending = THEME_FIELDS.filter(f => theme[f] !== DEFAULT_THEME_PREFERENCES[f]);
  const seeded: DeviceThemeCache = {
    theme,
    changedAt: Object.fromEntries(pending.map(f => [f, SEEDED_CHANGED_AT])),
    pending,
  };
  writeDeviceTheme(userId, seeded);
  return seeded;
}

export interface ThemeReconciliation {
  /** What the device should hold after the sync. */
  theme: ThemePreferences;
  /** Pending local changes newer than the server's: send these. */
  toPush: Partial<ThemePreferences>;
  /** Fields where the server's value replaced a different or missing device value. */
  adoptedFromServer: Partial<ThemePreferences>;
}

export function reconcileTheme(
  cache: DeviceThemeCache | null,
  serverTheme: ThemePreferences,
  serverFieldChangedAt: Partial<Record<ThemeField, number>>,
  serverUpdatedAt: number
): ThemeReconciliation {
  const device = deviceThemeOrDefaults(cache);
  const theme: ThemePreferences = { ...serverTheme };
  const toPush: Record<string, unknown> = {};
  const adopted: Record<string, unknown> = {};
  // Only a row from before per-field times falls back to the row's time; in a
  // timestamped row an untimed field was never changed there, so any edit beats it.
  const legacyRow = Object.keys(serverFieldChangedAt).length === 0;
  for (const field of THEME_FIELDS) {
    const isPending = cache?.pending.includes(field) ?? false;
    const changedAt = cache?.changedAt[field] ?? 0;
    const serverChangedAt = serverFieldChangedAt[field] ?? (legacyRow ? serverUpdatedAt : 0);
    if (isPending && changedAt > serverChangedAt) {
      (theme as unknown as Record<string, unknown>)[field] = device[field];
      toPush[field] = device[field];
    } else if (cache?.theme[field] !== serverTheme[field]) {
      // Includes a field this device never held (no copy yet, or a partial one
      // from an offline edit): its live value is a default, not the saved one.
      adopted[field] = serverTheme[field];
    }
  }
  return {
    theme,
    toPush: toPush as Partial<ThemePreferences>,
    adoptedFromServer: adopted as Partial<ThemePreferences>,
  };
}

/**
 * Settle fields the server now holds: store `values` on the device and drop each
 * field from pending. A field edited since `sentAt` (the change times seen when
 * the sync began) is left alone, so a slow sync never overwrites a newer edit.
 */
export function settleFields(
  userId: string,
  values: Partial<ThemePreferences>,
  sentAt: Partial<Record<ThemeField, number>>
): DeviceThemeCache {
  const cache = readDeviceTheme(userId) ?? { theme: {}, changedAt: {}, pending: [] };
  const theme = { ...cache.theme } as Record<string, unknown>;
  let pending = cache.pending;
  for (const field of Object.keys(values) as ThemeField[]) {
    if (cache.changedAt[field] !== sentAt[field]) continue;
    theme[field] = values[field];
    pending = pending.filter(f => f !== field);
  }
  const next: DeviceThemeCache = {
    theme: theme as Partial<ThemePreferences>,
    changedAt: cache.changedAt,
    pending,
  };
  writeDeviceTheme(userId, next);
  return next;
}
