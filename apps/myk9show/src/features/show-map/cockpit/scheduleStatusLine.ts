import {
  buildClassChecklist,
  summarizeClassChecklist,
  type ClassChecklistItem,
  type ClassChecklistSummary,
} from './classChecklist';
import { countClassEntries } from './cockpitClassEntries';
import type { SecretaryCockpitClass } from './secretaryCockpitTypes';

/** Line 2 of a schedule row: one phrase saying where the class is and what is next. */
export interface StatusLine {
  text: string;
  /** The phrase's `·`-separated parts, so the row can set the pending-entries link among them. */
  parts: readonly string[];
}

function line(parts: readonly (string | null)[]): StatusLine {
  const kept = parts.filter((part): part is string => Boolean(part));
  return { text: kept.join(' · '), parts: kept };
}

export function classChecklistItems(cls: SecretaryCockpitClass): ClassChecklistItem[] {
  return buildClassChecklist({
    lifecycle: cls.lifecycle ?? null,
    entryCount: cls.entryCount ?? null,
    scoredCount: cls.scoredCount ?? null,
    wrapUpStatus: cls.wrapUpStatus ?? null,
    registryId: cls.registryId ?? null,
    paperwork: cls.paperwork,
  });
}

export function classChecklistSummary(cls: SecretaryCockpitClass): ClassChecklistSummary | null {
  const items = classChecklistItems(cls);
  return items.length > 0 ? summarizeClassChecklist(items) : null;
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

/**
 * The schedule row's second line, from the class's lifecycle, its entries' run statuses and its
 * checklist. Pure so each case is a unit test: `Not started · 3 not checked in`,
 * `Running · 2 of 6 · Willow in ring`, `Print preliminary results`, `Waiting on judge signature`,
 * `Complete`. Without the checklist in use a complete class just reads `Complete`.
 */
export function buildStatusLine(cls: SecretaryCockpitClass, checklistInUse: boolean): StatusLine {
  const entries = cls.entries ?? [];
  const counts = countClassEntries(entries);
  switch (cls.lifecycle) {
    case 'cancelled':
      return line(['Cancelled']);
    case 'complete': {
      const next = checklistInUse ? nextStepAfterScoring(classChecklistItems(cls)) : null;
      return line([next ?? 'Complete']);
    }
    case 'in-progress': {
      const total = cls.entryCount ?? counts.entered;
      const scored = cls.scoredCount ?? counts.scored;
      const inRing = entries.find(entry => entry.runStatus?.value === 'in-ring');
      return line([
        'Running',
        total > 0 ? `${scored} of ${total}` : null,
        inRing ? `${inRing.dogName} in ring` : null,
      ]);
    }
    case 'not-started':
      return line([
        'Not started',
        counts.notCheckedIn > 0 ? `${counts.notCheckedIn} not checked in` : null,
      ]);
    default:
      return line(['Status not set']);
  }
}
