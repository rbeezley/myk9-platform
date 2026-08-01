export interface CannedAnswer {
  /** Stable id. This is the only thing the model is ever allowed to emit for auto-send. */
  id: string;
  /** Short human label, for the operator. */
  label: string;
  /** Shown to the model. Describe the question this answers, not the answer itself. */
  whenToUse: string;
  /** The exact text sent to the exhibitor. Operator-authored. Never model-authored. */
  reply: string;
  /**
   * Promotion switch. Flip to true only after this answer has recurred 3+ times and
   * your edits to its draft have stopped changing much. See
   * docs/plan-ai-support-triage.md for the promotion rule.
   */
  autoSend: boolean;
}

// INTENT: This list starts empty on purpose. Phase 0 auto-sends nothing — the queue
// writes these entries as real tickets arrive and you edit their drafts. Do not
// pre-populate it with guesses.
export const CANNED_ANSWERS: CannedAnswer[] = [];

export function findAutoSendableAnswer(
  id: string,
  answers: CannedAnswer[] = CANNED_ANSWERS
): CannedAnswer | null {
  const match = answers.find(answer => answer.id === id);
  if (!match) return null;
  if (!match.autoSend) return null;
  return match;
}

// INTENT: The catalogue deliberately carries `whenToUse` and never `reply`. The model
// selects an id; it never sees — and so can never paraphrase or leak — the exact text
// that goes to an exhibitor.
export function answerCatalogue(answers: CannedAnswer[] = CANNED_ANSWERS): string {
  if (answers.length === 0) {
    return 'No canned answers are available. Every ticket must be classified as novel.';
  }
  return answers.map(answer => `- ${answer.id}: ${answer.whenToUse}`).join('\n');
}
