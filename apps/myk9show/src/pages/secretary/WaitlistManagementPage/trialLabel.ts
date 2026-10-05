/**
 * "Trial 1 · Sat, Oct 10": names which trial a class belongs to, since shows repeat a class
 * across trials. The same label the queue cards show under each class (WaitlistTable), used by the
 * Offered group and the action dialog so an offer is never ambiguous (MYK9-1001).
 */
import { formatEntryDate } from '@/lib/format/dates';

export function formatTrialLabel(
  trial: { name?: string | null; date?: string | null } | null | undefined
): string {
  if (!trial) return '';
  // A calendar date (no time), so it needs no timezone conversion.
  return [trial.name, formatEntryDate(trial.date ?? null)].filter(Boolean).join(' · ');
}
