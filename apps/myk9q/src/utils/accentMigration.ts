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
