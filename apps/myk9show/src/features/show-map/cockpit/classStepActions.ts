import type { ClassChecklistItem, ClassChecklistState } from './classChecklist';
import type { SecretaryCockpitPaperwork } from './secretaryCockpitTypes';

/** What a step on the class step bar does when pressed (MYK9-1783). */
export type ClassStepAction =
  | { kind: 'print'; reportId: string; label: string }
  | { kind: 'link'; href: string; label: string }
  | { kind: 'editor'; label: string };

export const STEP_STATE_TEXT: Record<ClassChecklistState, string> = {
  done: 'Done',
  todo: 'Not done',
  reprint: 'Needs reprint',
  unknown: 'Unknown',
};

interface ClassStepContext {
  /** The class's paperwork rows; a print step is openable when its row has a `printHref`. */
  paperwork: readonly SecretaryCockpitPaperwork[];
  canManageShow: boolean;
  scoringHref: string;
  resultsHref: string;
}

/**
 * Resolves one checklist item to the task it opens, or null when nothing can be opened and the
 * step reads as plain status (no printable sheet, or Class started for someone who cannot edit it).
 */
export function resolveClassStepAction(
  item: ClassChecklistItem,
  context: ClassStepContext
): ClassStepAction | null {
  switch (item.id) {
    case 'class-started':
      return context.canManageShow ? { kind: 'editor', label: 'Set start time' } : null;
    case 'scoring-complete':
      return { kind: 'link', href: context.scoringHref, label: 'Open paper scoring' };
    case 'judge-signature':
      return { kind: 'link', href: context.resultsHref, label: 'Open on Results' };
    default: {
      const row = context.paperwork.find(entry => entry.reportId === item.id);
      return row?.printHref
        ? { kind: 'print', reportId: row.reportId, label: 'Open print preview' }
        : null;
    }
  }
}

/** The step's whole accessible name: label, state, then the action ("Score sheets, needs reprint. Open print preview"). */
export function classStepAccessibleName(
  item: ClassChecklistItem,
  action: ClassStepAction | null
): string {
  const state = STEP_STATE_TEXT[item.state].toLowerCase();
  const detail = item.detail ? `, ${item.detail}` : '';
  return `${item.label}, ${state}${detail}${action ? `. ${action.label}` : ''}`;
}
