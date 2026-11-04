import { isOnClassRunList } from '@/features/_shared/entryAccounting';
import { isPendingEntryStatus } from '@/features/entry-operations/classEntryBreakdown';
import type { ShowMapStatusKind } from './showMapTypes';

/**
 * The ONE eligibility rule for "Change class", as pure facts. The Show Map tree
 * (`canMoveUpEntry`, the Overview door) and the entry form's row menu both read
 * it, so the two doors cannot disagree about who may be moved.
 *
 * A change happens BEFORE the dog runs (owner, 2026-10-03): only an entry that has
 * not run, in a class that has not started.
 */
export interface ChangeClassFacts {
  /** Raw `entries.entry_status`. */
  entryStatus?: string | null | undefined;
  /** `classifyEntryRunStatus(entry)?.kind`: muted retired, complete scored, active in the ring. */
  runStatusKind?: ShowMapStatusKind | undefined;
  /** `classifyClassStatus(class.status)?.kind`; absent reads as not started. */
  classStatusKind?: ShowMapStatusKind | undefined;
}

const NOT_STARTED_OR_ATTENTION: ReadonlySet<ShowMapStatusKind | undefined> = new Set([
  undefined,
  'neutral',
  'attention',
]);

/** Why this entry cannot change class, in words for the secretary; null when it can. */
export function getChangeClassBlock(facts: ChangeClassFacts): string | null {
  const { entryStatus, runStatusKind, classStatusKind } = facts;
  if (!NOT_STARTED_OR_ATTENTION.has(runStatusKind)) {
    if (runStatusKind === 'complete') return 'This entry has already run.';
    if (runStatusKind === 'active') return 'This entry is in the ring.';
    // muted: moved, pulled or scratched (MYK9-825).
    return 'This entry was already moved or removed.';
  }
  // Owner decision 2026-10-03 (MYK9-976): hidden until accepted, never on a withdrawn,
  // scratched or not-accepted entry.
  if (isPendingEntryStatus(entryStatus)) return 'Accept this entry first.';
  if (!isOnClassRunList({ entryStatus: entryStatus ?? undefined }))
    return 'This entry is withdrawn or scratched.';
  if (classStatusKind !== undefined && classStatusKind !== 'neutral') {
    return 'Its class has already started.';
  }
  return null;
}

export function canChangeClass(facts: ChangeClassFacts): boolean {
  return getChangeClassBlock(facts) === null;
}
