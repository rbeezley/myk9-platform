import type { ClassChecklistItem, ClassChecklistState } from './classChecklist';
import type { SecretaryCockpitPaperwork } from './secretaryCockpitTypes';

/** What a step on the class step bar does when pressed (MYK9-1783). */
export type ClassStepAction =
  | { kind: 'print'; reportId: string; label: string }
  | { kind: 'link'; href: string; label: string }
  | { kind: 'editor'; label: string }
  /** Nothing to press: the step's task is not this viewer's, and `label` says why. */
  | { kind: 'blocked'; label: string };

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
  /**
   * Set for a manager who cannot operate the show (a club admin who is not its trial secretary).
   * Paper scoring is `ProtectedRoute(SECRETARY | JUDGE | SITE_ADMIN)`, so a link there would lead
   * them into a refusal (REV-2341 R-1, MYK9-1802).
   */
  secretaryOnlyReason?: string | undefined;
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
      return context.secretaryOnlyReason !== undefined
        ? { kind: 'blocked', label: context.secretaryOnlyReason }
        : { kind: 'link', href: context.scoringHref, label: 'Open paper scoring' };
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
