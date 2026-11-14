import { DISPLAY_LABELS } from '@/components/classes/ClassResultsTable/constants';
import type { EntryScoreAuditItem } from '@/services/database/entries/scoreAudit';
import { dbSecondsToInputFormat, mapResultStatusToQualification } from '@/utils/scoringMappings';

/** One score a secretary changed after the judge had submitted it. */
export interface ScoreCorrection {
  /** "time", "faults", "result" or "reason": how the judge's page words the field. */
  fieldLabel: string;
  /** The value as the judge submitted it, ready to print. */
  was: string;
  /** The value now. */
  now: string;
  /** When the last correction of this field landed, on the trial's clock: "10:42 AM". */
  at: string;
}

/** The scoring columns a judge's results page shows. Placement moves with them and is not listed. */
const SHOWN_FIELDS: Readonly<Record<string, string>> = {
  search_time_seconds: 'time',
  total_faults: 'faults',
  result_status: 'result',
  disqualification_reason: 'reason',
};

/** Rows written by a judge or steward at the ring: the score "as submitted". */
function isRingsideTier(tier: EntryScoreAuditItem['actorTier']): boolean {
  return tier !== 'manager' && tier !== 'system';
}

function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return 'none';
  if (field === 'search_time_seconds') {
    return typeof value === 'number' ? dbSecondsToInputFormat(value) || 'none' : String(value);
  }
  if (field === 'result_status') {
    const qualification = mapResultStatusToQualification(String(value));
    return qualification ? (DISPLAY_LABELS[qualification] ?? qualification) : 'pending';
  }
  return String(value);
}

function clockTime(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date
    .toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit' })
    .replace(/\s/g, ' ');
}

/**
 * The scores a manager changed AFTER a judge or steward submitted them, from one entry's score
 * history (oldest first). A manager row with no earlier ringside row is the secretary entering the
 * score, not correcting one, so it is never marked. A field changed twice reads from the judge's
 * value to the final one, and one that ended where it began is not marked.
 */
export function findScoreCorrections(history: readonly EntryScoreAuditItem[]): ScoreCorrection[] {
  const ordered = [...history].sort(
    (a, b) => a.changedAt.localeCompare(b.changedAt) || a.id.localeCompare(b.id)
  );
  const firstRingside = ordered.findIndex(item => isRingsideTier(item.actorTier));
  if (firstRingside < 0) return [];
  const byField = new Map<string, { was: unknown; now: unknown; at: string }>();
  for (const item of ordered.slice(firstRingside + 1)) {
    if (item.actorTier !== 'manager') continue;
    for (const change of item.changes) {
      if (!(change.field in SHOWN_FIELDS)) continue;
      const seen = byField.get(change.field);
      byField.set(change.field, {
        was: seen ? seen.was : change.oldValue,
        now: change.newValue,
        at: clockTime(item.changedAt, item.timeZone),
      });
    }
  }
  const corrections: ScoreCorrection[] = [];
  for (const [field, seen] of byField) {
    const was = formatValue(field, seen.was);
    const now = formatValue(field, seen.now);
    if (was === now) continue;
    corrections.push({ fieldLabel: SHOWN_FIELDS[field]!, was, now, at: seen.at });
  }
  return corrections;
}

/** "Changed after you submitted: time was 0:38.50, corrected by the secretary at 10:42 AM". */
export function correctionLine(corrections: readonly ScoreCorrection[]): string {
  if (corrections.length === 0) return '';
  const parts = corrections.map(item => `${item.fieldLabel} was ${item.was}`);
  const at = corrections[corrections.length - 1]!.at;
  return `Changed after you submitted: ${parts.join(', ')}, corrected by the secretary${at ? ` at ${at}` : ''}`;
}
