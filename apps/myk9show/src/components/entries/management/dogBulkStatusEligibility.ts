import { EntryStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { resolveEntryStatusActions } from './entryActions';
import { formatTrialLabel } from './entryFormTrialSummary';

/**
 * MYK9-1688: which of ONE dog's entries a dog-level "Pull <dog> from all entries" or
 * "Withdraw <dog>…" may touch. It reuses the per-entry menu's own rule, so the bulk verb
 * never reaches an entry the per-entry verb would not offer.
 *
 * - Pull: `resolveEntryStatusActions` offers the `pull` action (the status popover's list).
 * - Withdraw: the status popover offers "Withdraw…" whenever it renders and is enabled, which is
 *   any entry that is not Moved and has at least one status action.
 *
 * On top of that, a dog-level verb leaves alone what a per-entry click would visibly confirm:
 * an entry that has already run (completed, or carrying a recorded result) and, for Withdraw,
 * one already withdrawn (nothing to do).
 */
export type DogBulkVerb = 'pull' | 'withdraw';

export interface DogBulkExclusion {
  entry: EntryManagementEntry;
  /** "Mon, Nov 9 · Trial 1 · Novice Interior": which run of which class. */
  label: string;
  reason: string;
}

export interface DogBulkEligibility {
  eligible: EntryManagementEntry[];
  excluded: DogBulkExclusion[];
}

const noopStatusChange = () => undefined;

function hasRecordedResult(entry: EntryManagementEntry): boolean {
  if (entry.entryStatus === EntryStatus.COMPLETED || entry.isScored) return true;
  const result = entry.resultStatus ?? '';
  return result !== '' && result !== 'pending';
}

function exclusionReason(entry: EntryManagementEntry, verb: DogBulkVerb): string | null {
  if (hasRecordedResult(entry)) return 'already run';
  if (entry.entryStatus === EntryStatus.MOVED) return 'moved';
  const actions = resolveEntryStatusActions(entry, { onStatusChange: noopStatusChange });
  if (verb === 'pull') {
    if (entry.entryStatus === EntryStatus.SCRATCHED) return 'already pulled';
    return actions.some(action => action.id === 'pull') ? null : 'not available';
  }
  if (entry.entryStatus === EntryStatus.CANCELLED) return 'already withdrawn';
  return actions.length > 0 ? null : 'not available';
}

/** "Mon, Nov 9 · Trial 1 · Novice Interior, Novice Exterior" for one entry. */
export function describeEntryRun(entry: EntryManagementEntry): string {
  const trials = new Set<string>();
  const classes = entry.classes.map(cls => {
    const trial = formatTrialLabel(cls.trialDate, cls.trialNumber);
    if (trial) trials.add(trial);
    return cls.name;
  });
  return [...trials, classes.join(', ')].filter(Boolean).join(' · ') || 'Entry';
}

export function resolveDogBulkEligibility(
  entries: readonly EntryManagementEntry[],
  verb: DogBulkVerb
): DogBulkEligibility {
  const eligible: EntryManagementEntry[] = [];
  const excluded: DogBulkExclusion[] = [];
  for (const entry of entries) {
    const reason = exclusionReason(entry, verb);
    if (reason === null) eligible.push(entry);
    else excluded.push({ entry, label: describeEntryRun(entry), reason });
  }
  return { eligible, excluded };
}
