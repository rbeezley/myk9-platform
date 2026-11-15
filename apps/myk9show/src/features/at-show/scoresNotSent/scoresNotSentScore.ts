/**
 * The score itself, as a row of "Scores not sent" shows it (MYK9-2011): result, time, faults and
 * reason, from the fields the scoresheet queued. The secretary can key it at the desk from the
 * judge's phone, so every part the judge chose is shown.
 */
import { resultLabel } from '@myk9/scoring-ui';
import { resultStatusLabel } from '@/components/common/resultStatusLabel';
import { formatSecondsAsMSSCC } from '@/lib/format/searchTime';

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** ["Qualified", "0:04.35", "0 faults"] or ["NQ", "1 fault", "Incorrect Call"]. */
export function describeUnsentScore(fields: Readonly<Record<string, unknown>>): string[] {
  const parts: string[] = [];
  const status = typeof fields.result_status === 'string' ? fields.result_status : '';
  if (status) parts.push(resultLabel(resultStatusLabel(status)));
  const seconds = finiteNumber(fields.search_time_seconds);
  if (seconds !== undefined && seconds > 0) parts.push(formatSecondsAsMSSCC(seconds));
  const faults = finiteNumber(fields.total_faults);
  if (faults !== undefined) parts.push(`${faults} ${faults === 1 ? 'fault' : 'faults'}`);
  const reason = fields.disqualification_reason;
  if (typeof reason === 'string' && reason.trim()) parts.push(reason.trim());
  return parts;
}
