// MYK9-2274: one alert to the owner, the first time a platform-wide count
// passes the number the offline design was sized for. Plan: docs/plan-offline-scale.md
// ("The alert"). Deno-free and side-effect free like its siblings; cron-health-check
// (full runs only) supplies the readers and the alert sender.
//
// Counts are platform-wide, so only the server can take them. Soft-deleted rows
// are left out, the way the replicas leave them out.

/** The hosted PostgREST `max_rows` (MYK9-2258 recorded 1,000). The saved people
 * directory is one request, so person 1,001 and later silently drop out. */
export const HOSTED_MAX_ROWS = 1000;

export type ScaleCountKey = 'people' | 'dogs' | 'classes' | 'liveClubs';

/** Alert-at numbers, in one place. People is 80% of the row limit, so the alert
 * arrives before the first person would be dropped. */
export const SCALE_THRESHOLDS: Record<ScaleCountKey, number> = {
  people: HOSTED_MAX_ROWS * 0.8,
  dogs: 10_000,
  classes: 5_000,
  liveClubs: 10,
};

const SCALE_KEYS: readonly ScaleCountKey[] = ['people', 'dogs', 'classes', 'liveClubs'];

const LABELS: Record<ScaleCountKey, string> = {
  people: 'People',
  dogs: 'Dogs',
  classes: 'Classes',
  liveClubs: 'Live clubs',
};

/** Matches `club_has_public_show()`: non-deleted shows in these statuses. */
export const LIVE_CLUB_SHOW_STATUSES = [
  'published',
  'upcoming',
  'in_progress',
  'completed',
] as const;

export const SCALE_ALERT_SOURCE = 'scale-limits';

export type ScaleCounts = Record<ScaleCountKey, number>;

/** Keys whose count has reached its alert-at number. */
export function crossedThresholds(counts: ScaleCounts): ScaleCountKey[] {
  return SCALE_KEYS.filter(key => counts[key] >= SCALE_THRESHOLDS[key]);
}

/** One key per SET of crossed thresholds. The same set never alerts twice (even
 * after the owner resolves the alert), and a newly crossed threshold is a new set. */
export function scaleDedupeKey(crossed: readonly ScaleCountKey[]): string {
  return `scale-limits:${[...crossed].sort().join('+')}`;
}

export function buildScaleAlert(counts: ScaleCounts, crossed: readonly ScaleCountKey[]) {
  const names = crossed.map(key => LABELS[key].toLowerCase()).join(', ');
  const fmt = (n: number) => n.toLocaleString('en-US');
  const rows = SCALE_KEYS.map(
    key =>
      `<li>${LABELS[key]}: ${fmt(counts[key])} (alert at ${fmt(SCALE_THRESHOLDS[key])})${crossed.includes(key) ? ' <b>passed</b>' : ''}</li>`
  ).join('');
  return {
    subject: `Scale limit reached: ${names}`,
    html: `<p>The platform has passed a limit the offline design was sized for. See docs/plan-offline-scale.md.</p><ul>${rows}</ul><p>This alert is sent once for this set of limits.</p>`,
    detail: { counts, thresholds: SCALE_THRESHOLDS, crossed: [...crossed] },
  };
}

export interface ScaleLimitsDeps {
  readCounts: () => Promise<ScaleCounts | { error: string }>;
  /** True when ANY operator_alerts row (resolved or not) with this source and key
   * is recorded as emailed. A row whose email failed does not count, so the next
   * run tries again. */
  alertExists: (source: string, dedupeKey: string) => Promise<boolean | { error: string }>;
  raiseAlert: (
    subject: string,
    html: string,
    opts: { severity: 'warn'; source: string; dedupeKey: string; detail: Record<string, unknown> }
  ) => Promise<{ emailed: boolean }>;
  /** Records on the row(s) that the email went out (detail.emailed = true). */
  markEmailed: (
    source: string,
    dedupeKey: string,
    detail: Record<string, unknown>
  ) => Promise<void>;
}

export type ScaleLimitsOutcome =
  | { status: 'below' }
  | { status: 'already_alerted'; dedupeKey: string }
  | { status: 'alerted'; dedupeKey: string }
  | { status: 'email_failed'; dedupeKey: string }
  | { status: 'error'; message: string };

/** Never throws: the health snapshot must not fail because this check did. */
export async function runScaleLimitsCheck(deps: ScaleLimitsDeps): Promise<ScaleLimitsOutcome> {
  try {
    const counts = await deps.readCounts();
    if ('error' in counts) return { status: 'error', message: counts.error };
    const crossed = crossedThresholds(counts);
    if (crossed.length === 0) return { status: 'below' };
    const dedupeKey = scaleDedupeKey(crossed);
    const exists = await deps.alertExists(SCALE_ALERT_SOURCE, dedupeKey);
    if (typeof exists === 'object') return { status: 'error', message: exists.error };
    if (exists) return { status: 'already_alerted', dedupeKey };
    const { subject, html, detail } = buildScaleAlert(counts, crossed);
    // No skipEmailOnDuplicate: a row left by a failed email must still be emailed.
    const { emailed } = await deps.raiseAlert(subject, html, {
      severity: 'warn',
      source: SCALE_ALERT_SOURCE,
      dedupeKey,
      detail,
    });
    if (!emailed) return { status: 'email_failed', dedupeKey };
    await deps.markEmailed(SCALE_ALERT_SOURCE, dedupeKey, { ...detail, emailed: true });
    return { status: 'alerted', dedupeKey };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
