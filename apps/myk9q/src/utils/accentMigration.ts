const STORAGE_KEY = 'myK9Q_settings';

const ACCENT_RENAMES: Record<string, string> = {
  green: 'teal',
  orange: 'terracotta',
};

interface PersistedSettings {
  state?: { settings?: { accentColor?: unknown } };
  settings?: { accentColor?: unknown };
}

function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Quota exceeded or Safari private mode. Migration is best-effort;
    // bail quietly so app boot continues.
  }
}

export function runAccentMigration(): void {
  const raw = safeGetItem(STORAGE_KEY);
  if (!raw) return;

  let parsed: PersistedSettings;
  try {
    parsed = JSON.parse(raw) as PersistedSettings;
  } catch {
    // Malformed — let downstream validation handle it.
    return;
  }

  const settings = parsed.state?.settings ?? parsed.settings;
  if (!settings || typeof settings !== 'object') return;

  const current = settings.accentColor;
  if (typeof current !== 'string') return;

  const next = ACCENT_RENAMES[current];
  if (!next) return;

  settings.accentColor = next;
  safeSetItem(STORAGE_KEY, JSON.stringify(parsed));
}

/**
 * Reverse shim — rewrites canonical v2 accent values back to legacy
 * values (teal -> green, terracotta -> orange). Not invoked in normal
 * operation. A revert commit can swap `runAccentMigration` with
 * `runAccentMigrationReverse` in main.tsx to un-strand users whose
 * localStorage has already been migrated.
 *
 * Kept in the repo (rather than written fresh during a revert) so the
 * reverse path is tested and ready before it is needed.
 */
export function runAccentMigrationReverse(): void {
  const raw = safeGetItem(STORAGE_KEY);
  if (!raw) return;

  let parsed: PersistedSettings;
  try {
    parsed = JSON.parse(raw) as PersistedSettings;
  } catch {
    return;
  }

  const settings = parsed.state?.settings ?? parsed.settings;
  if (!settings || typeof settings !== 'object') return;

  const current = settings.accentColor;
  if (typeof current !== 'string') return;

  const reverseMap: Record<string, string> = {
    teal: 'green',
    terracotta: 'orange',
  };
  const next = reverseMap[current];
  if (!next) return;

  settings.accentColor = next;
  safeSetItem(STORAGE_KEY, JSON.stringify(parsed));
}
