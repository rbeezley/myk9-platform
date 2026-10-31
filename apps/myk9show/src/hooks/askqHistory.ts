/**
 * Device-local Ask Queue conversation history.
 *
 * localStorage on purpose: a per-viewer convenience, not replicated data, so the
 * offline-first rule does not apply. Keyed by signed-in user and show so a second
 * user on the same device (or another show) never sees it. Every storage touch is
 * wrapped; with storage blocked the thread simply lives in memory.
 *
 * Privacy: an entry stores only what the panel already rendered (question, answer,
 * tool labels, source rows, feedback id) and never the raw request or any other field.
 */

export interface AskQHistoryEntry {
  id: string;
  question: string;
  answer: string;
  toolsUsed: string[];
  sources: Record<string, unknown[]>;
  queryLogId: string | null;
  /** Epoch ms when the answer completed. */
  askedAt: number;
}

export const ASKQ_HISTORY_MAX_ENTRIES = 20;
export const ASKQ_HISTORY_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

const KEY_PREFIX = 'askq-history:v1';

export function askqHistoryKey(userId: string, scope: string): string {
  return `${KEY_PREFIX}:${userId}:${scope}`;
}

/** Drops entries older than 14 days, then keeps the newest 20. */
export function pruneAskQHistory(
  entries: AskQHistoryEntry[],
  now: number = Date.now()
): AskQHistoryEntry[] {
  return entries
    .filter(entry => now - entry.askedAt <= ASKQ_HISTORY_MAX_AGE_MS)
    .slice(-ASKQ_HISTORY_MAX_ENTRIES);
}

function isEntry(value: unknown): value is AskQHistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    typeof e.question === 'string' &&
    typeof e.answer === 'string' &&
    typeof e.askedAt === 'number' &&
    Array.isArray(e.toolsUsed) &&
    typeof e.sources === 'object' &&
    e.sources !== null
  );
}

/** Fields `AskQSources` renders per source type; everything else is dropped before saving. */
const DISPLAYED_SOURCE_FIELDS: Record<string, string[]> = {
  rules: ['title', 'section'],
  entries: ['call_name', 'dog_name', 'final_placement', 'result_status'],
  classes: ['element', 'level', 'class_status'],
  trials: ['trial_name', 'trial_date'],
};

export function projectSourcesForHistory(
  sources: Record<string, unknown[]>
): Record<string, unknown[]> {
  const projected: Record<string, unknown[]> = {};
  for (const [type, items] of Object.entries(sources)) {
    const fields = DISPLAYED_SOURCE_FIELDS[type];
    if (!fields || !Array.isArray(items)) continue;
    projected[type] = items.map(item => {
      const row = (item ?? {}) as Record<string, unknown>;
      return Object.fromEntries(fields.filter(f => f in row).map(f => [f, row[f]]));
    });
  }
  return projected;
}

export function loadAskQHistory(userId: string, scope: string): AskQHistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(askqHistoryKey(userId, scope));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const kept = pruneAskQHistory(parsed.filter(isEntry));
    // Expired or malformed rows must not linger on the device: persist the pruned result.
    if (kept.length !== parsed.length) {
      if (kept.length === 0) window.localStorage.removeItem(askqHistoryKey(userId, scope));
      else saveAskQHistory(userId, scope, kept);
    }
    return kept;
  } catch {
    return [];
  }
}

export function saveAskQHistory(userId: string, scope: string, entries: AskQHistoryEntry[]): void {
  try {
    window.localStorage.setItem(askqHistoryKey(userId, scope), JSON.stringify(entries));
  } catch {
    // Storage blocked or full: the thread stays in memory only.
  }
}

export function clearAskQHistory(userId: string, scope: string): void {
  try {
    window.localStorage.removeItem(askqHistoryKey(userId, scope));
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
