import { safeLocalStorageGet, safeLocalStorageSet } from './localStorageUtils';

const STORAGE_KEY = 'myK9Q_settings';

// Mirror of LEGACY_ACCENT_RENAMES in public/theme-init.js. Any change here
// MUST be applied there too — theme-init.js runs before React and normalizes
// legacy values at first paint; this shim rewrites localStorage at boot.
const ACCENT_RENAMES: Record<string, string> = {
  green: 'teal',
  orange: 'terracotta',
};

interface PersistedSettings {
  state?: { settings?: { accentColor?: unknown } };
  settings?: { accentColor?: unknown };
}

function migrateWith(renames: Record<string, string>): void {
  const parsed = safeLocalStorageGet<PersistedSettings | null>(STORAGE_KEY, null);
  if (!parsed) return;

  const settings = parsed.state?.settings ?? parsed.settings;
  if (!settings || typeof settings !== 'object') return;

  const current = settings.accentColor;
  if (typeof current !== 'string') return;

  const next = renames[current];
  if (!next) return;

  settings.accentColor = next;
  safeLocalStorageSet(STORAGE_KEY, parsed);
}

export function runAccentMigration(): void {
  migrateWith(ACCENT_RENAMES);
}
