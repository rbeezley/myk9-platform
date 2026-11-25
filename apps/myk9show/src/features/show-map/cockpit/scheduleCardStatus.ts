import { buildClassChecklist, type ClassChecklistItem } from './classChecklist';
import { countClassEntries, runQueuePreview } from './cockpitClassEntries';
import type { SecretaryCockpitClass } from './secretaryCockpitTypes';

/**
 * What a schedule class card says under the name, judge and time (MYK9-2143), in the Ringside
 * card's grammar: the scored count beside the status badge, who is in the ring and who is next,
 * and the desk's own next-step phrase.
 */
export interface ScheduleCardStatus {
  /** Scored over entered. Null when the count is unknown, zero or the class is cancelled. */
  progress: { scored: number; total: number } | null;
  /** The dog in the ring, while the class is running. */
  inRing: { armband: string | null; dogName: string } | null;
  /**
   * The next waiting dogs in run order, while the class is running: `#105`, or the call name for
   * a dog with no armband yet, so the line never skips a dog the In ring tile lists.
   */
  nextUp: readonly string[];
  /** What the secretary does next, or what is holding the class: null when nothing is. */
  nextStep: string | null;
}

function classChecklistItems(cls: SecretaryCockpitClass): ClassChecklistItem[] {
  return buildClassChecklist({
    lifecycle: cls.lifecycle ?? null,
    entryCount: cls.entryCount ?? null,
    scoredCount: cls.scoredCount ?? null,
    wrapUpStatus: cls.wrapUpStatus ?? null,
    registryId: cls.registryId ?? null,
    paperwork: cls.paperwork,
  });
}

/** What the secretary does next for a step that is not done, in the verb the checklist uses. */
const NEXT_STEP: Record<string, string> = {
  'results-sheet': 'preliminary results',
  'result-labels': 'result labels',
};

/**
 * Once a class is complete only the after-scoring steps are next: a check-in sheet nobody printed
 * is no longer a task. `unknown` is not "not done" (the entries could not be read).
 */
function nextStepAfterScoring(items: readonly ClassChecklistItem[]): string | null {
  for (const item of items) {
    if (item.state !== 'todo' && item.state !== 'reprint') continue;
    if (item.id === 'judge-signature') return 'Waiting on judge signature';
    const noun = NEXT_STEP[item.id];
    if (noun) return `${item.state === 'reprint' ? 'Reprint' : 'Print'} ${noun}`;
  }
  return null;
}

const NOTHING: ScheduleCardStatus = {
  progress: null,
  inRing: null,
  nextUp: [],
  nextStep: null,
};

/**
 * The card's status from the class's lifecycle, its entries' run statuses and its checklist. Pure
 * so each case is a unit test. The lifecycle itself is the card's badge, so it is not repeated
 * here; without the checklist in use a complete class has no next step.
 */
export function buildScheduleCardStatus(
  cls: SecretaryCockpitClass,
  checklistInUse: boolean
): ScheduleCardStatus {
  if (cls.lifecycle === 'cancelled') return NOTHING;
  const entries = cls.entries ?? [];
  const counts = countClassEntries(entries);
  // The entries' own counts once they are read; the class's counts only while they are not. An
  // unknown total is never spelled as a zero (MYK9-637).
  const read = entries.length > 0;
  const total = read ? counts.entered : (cls.entryCount ?? null);
  const scored = read ? counts.scored : (cls.scoredCount ?? 0);
  const progress = total !== null && total > 0 ? { scored, total } : null;

  switch (cls.lifecycle) {
    case 'complete':
      return {
        ...NOTHING,
        progress,
        nextStep: checklistInUse ? nextStepAfterScoring(classChecklistItems(cls)) : null,
      };
    case 'in-progress': {
      const { inRing, nextUp } = runQueuePreview(entries);
      return {
        progress,
        inRing: inRing ? { armband: inRing.armband ?? null, dogName: inRing.dogName } : null,
        nextUp: nextUp.map(entry => (entry.armband ? `#${entry.armband}` : entry.dogName)),
        nextStep: null,
      };
    }
    case 'not-started':
      return {
        ...NOTHING,
        progress,
        // Of the same entered total; notCheckedIn is 0 while the entries are unread. A class with
        // no rows and a count known to be zero says so: with no count beside the badge it would
        // otherwise read like a class whose entries have not loaded. Rows that will not run
        // (pending, pulled, absent) are entries, so a class holding only those does not say it.
        nextStep:
          counts.notCheckedIn > 0
            ? `${counts.notCheckedIn} of ${counts.entered} not checked in`
            : !read && cls.entryCount === 0
              ? 'None entered'
              : null,
      };
    default:
      return { ...NOTHING, progress };
  }
}
