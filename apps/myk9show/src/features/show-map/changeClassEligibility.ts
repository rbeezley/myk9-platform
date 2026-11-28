import { isOnClassRunList } from '@/features/_shared/entryAccounting';
import { isPendingEntryStatus } from '@/features/entry-operations/classEntryBreakdown';
import { getTrialRegistry } from '@/features/registries';
import { STARTED_CHECK_IN_STATUSES } from './showMapStatus';
import type { ShowMapStatusKind } from './showMapTypes';

/**
 * The ONE eligibility rule for "Change class", as pure facts. The Show Map tree
 * (`canMoveUpEntry`, the Overview door) and the entry form's row menu both read
 * it, so the two doors cannot disagree about who may be moved.
 *
 * A change is offered while the DOG has not run (owner, 2026-11-26, MYK9-2476, replacing the
 * 2026-10-03 "class has not started" half of the MYK9-976 rule): an accepted entry that has not
 * run, is not in the ring and was not moved, pulled or scratched, even when its class has
 * started, so a wrong class found at the ring is fixed in place. A finished or cancelled class
 * still blocks. The rulebooks' class change deadlines (AKC Scent Work Ch. 3 s21 and UKC Nosework:
 * 30 minutes before judging starts; ASCA 1.5.15: silent on timing) are deliberately not enforced,
 * the same way the 30-minute deadline never was (owner, 2026-11-27: all registries); AKC and UKC
 * get a one-line note instead (`getChangeClassNote`).
 */
export interface ChangeClassFacts {
  /** Raw `entries.entry_status`. */
  entryStatus?: string | null | undefined;
  /** `classifyEntryRunStatus(entry)?.kind`: muted retired, complete scored, active in the ring. */
  runStatusKind?: ShowMapStatusKind | undefined;
  /** `classifyClassStatus(class.status)?.kind`; absent reads as not started. Only complete and muted block. */
  classStatusKind?: ShowMapStatusKind | undefined;
}

const NOT_RUN_OR_ATTENTION: ReadonlySet<ShowMapStatusKind | undefined> = new Set([
  undefined,
  'neutral',
  'attention',
]);

/** Shown beside Change class when there is no connection; both desks say it in these words. */
export const CHANGE_CLASS_OFFLINE_REASON = 'Changing a class needs a connection.';
/** Shown beside Change handler when there is no connection (the handler save is online-only). */
export const CHANGE_HANDLER_OFFLINE_REASON = 'Changing a handler needs a connection.';

/** Why this entry cannot change class, in words for the secretary; null when it can. */
export function getChangeClassBlock(facts: ChangeClassFacts): string | null {
  const { entryStatus, runStatusKind, classStatusKind } = facts;
  if (!NOT_RUN_OR_ATTENTION.has(runStatusKind)) {
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
  // A started class (active) still takes the change; only a finished or cancelled one cannot.
  if (classStatusKind === 'complete') return 'Its class is finished.';
  if (classStatusKind === 'muted') return 'Its class was cancelled.';
  return null;
}

export function canChangeClass(facts: ChangeClassFacts): boolean {
  return getChangeClassBlock(facts) === null;
}

/** What one dog in a class says about whether judging has begun (the run kind and check-in value). */
export interface ClassEntryEvidence {
  runStatusKind?: ShowMapStatusKind | undefined;
  checkInStatus?: string | undefined;
}

/**
 * Whether judging is underway in a class whose stored status may still read "not started":
 * `refresh_class_scoring_state` flips it only once a dog is accounted for, so a dog in the ring
 * or checked in is also evidence. Same rule as `hasClassStarted` (showMapStatus), read from
 * facts the callers already hold; a moved, pulled or scratched dog does not start a class.
 */
export function isJudgingUnderway(
  classStatusKind: ShowMapStatusKind | undefined,
  entries: readonly ClassEntryEvidence[]
): boolean {
  if (classStatusKind === 'active' || classStatusKind === 'complete') return true;
  return entries.some(entry => {
    if (entry.runStatusKind === 'muted') return false;
    if (entry.runStatusKind === 'complete' || entry.runStatusKind === 'active') return true;
    return entry.checkInStatus !== undefined && STARTED_CHECK_IN_STATUSES.has(entry.checkInStatus);
  });
}

/**
 * One plain line shown beside an offered Change class once judging has started in the class,
 * for the registries whose rulebook sets a class change deadline (AKC, UKC); `null` for ASCA,
 * whose rules are silent on timing, and while judging has not begun. Informational only.
 * `judgingUnderway` is `isJudgingUnderway(...)`; the stored class status alone can lag the ring.
 */
export function getChangeClassNote(input: {
  registryId?: string | null | undefined;
  judgingUnderway: boolean;
}): string | null {
  if (!input.judgingUnderway) return null;
  const registryId = getTrialRegistry({ registryId: input.registryId }).id;
  if (registryId !== 'AKC' && registryId !== 'UKC') return null;
  return "The rulebook's class change deadline has passed. This change is your call.";
}
