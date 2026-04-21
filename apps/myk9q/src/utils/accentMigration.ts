import { safeLocalStorageGet, safeLocalStorageSet } from './localStorageUtils';

const STORAGE_KEY = 'myK9Q_settings';

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

/**
 * Reverse shim — rewrites canonical v2 accent values back to legacy values.
 * Not invoked in normal operation. A revert commit can swap runAccentMigration
 * for this in main.tsx to un-strand users whose localStorage already holds v2
 * values. Kept in the repo so the reverse path is tested and ready.
 */
export function runAccentMigrationReverse(): void {
  const reverse = Object.fromEntries(Object.entries(ACCENT_RENAMES).map(([k, v]) => [v, k]));
  migrateWith(reverse);
}
