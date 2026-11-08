import type { EntryScoreAuditItem, ScoreAuditTier } from '@/services/database/entries/scoreAudit';

/** Label for who made the change: the person's name when known, else how they got in. */
const TIER_LABELS: Record<string, string> = {
  manager: 'Show staff',
  assigned_judge: 'Assigned judge',
  steward: 'Steward',
  passcode_judge: 'Ringside code (judge)',
  passcode_admin: 'Ringside code (admin)',
  passcode_steward: 'Ringside code (steward)',
  system: 'Automatic',
};

export function scoreAuditTierLabel(tier: ScoreAuditTier): string {
  return TIER_LABELS[tier] ?? 'Unknown source';
}

export function scoreAuditActorLabel(item: Pick<EntryScoreAuditItem, 'actorName' | 'actorTier'>) {
  // A system row (placement recalculation, cron) can carry the signed-in user that
  // set it off; the change itself was automatic, so say so rather than name them.
  if (item.actorTier === 'system') return scoreAuditTierLabel(item.actorTier);
  return item.actorName ?? scoreAuditTierLabel(item.actorTier);
}

/**
 * A moment in the show's own timezone. Intl rejects `timeStyle` together with
 * `timeZoneName`, so the parts are spelled out.
 */
export function formatScoreAuditTime(iso: string | null, timeZone: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

export function scoreAuditFieldLabel(field: string): string {
  const spaced = field.replace(/_/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function formatScoreAuditValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'empty';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return JSON.stringify(value);
}
