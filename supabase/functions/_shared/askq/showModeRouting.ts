import type { AskQQuestionMode } from './types.ts';

// MYK9-1775: "This show" is the panel's default on a show page, so people ask it
// how-to and rules questions. Those are answered by the same grounded path App help
// and Rules use (verified guides plus server-checked quotes, or this show's
// rulebook), chosen here per question. Live-data questions keep the show-data tools.
const LIVE_DATA_PATTERN =
  /\b(results?|placements?|placed|placing|scores?|scored|qualif\w*|standings|schedule|running order|run order|what time|armbands?|how many|how did|who (?:won|is|are|got|has|was)|which (?:entries|dogs|classes|trials|judges?)|my (?:entries|results|schedule|runs)|checked[- ]in)\b/i;
const APP_HELP_PATTERN =
  /\b(how (?:do|can|would|should) (?:i|we)|how to|where (?:do|can) (?:i|we)|withdraw|pull|leave (?:a |the |my )?class|drop|cancel\w*|refunds?|money back|fees?|deadline|take my dog out|sign ?up|log ?in|password|invite)\b/i;
const RULES_PATTERN =
  /\b(rule|rules|regulation|regulations|requirement|requirements|allowed|fault|faults|max(?:imum)? time|time limit|time limits|judge(?:s)? briefing|hide|hides|odor|container|containers|interior|exterior|buried|handler discrimination)\b/i;

/**
 * For a "This show" question that is not about live show data, the mode whose
 * grounding should answer it. Every other mode, and every data question, is unchanged.
 */
export function routeShowModeQuestion(
  questionMode: AskQQuestionMode | null,
  message: string
): AskQQuestionMode | null {
  if (questionMode !== 'show-data') return questionMode;
  if (LIVE_DATA_PATTERN.test(message)) return 'show-data';
  if (APP_HELP_PATTERN.test(message)) return 'app-help';
  if (RULES_PATTERN.test(message)) return 'rules';
  return 'show-data';
}

export interface AnswerPlan {
  answerMode: AskQQuestionMode | null;
  /** True when the guide-quote support path answers: tools off, quotes verified. */
  answerSupportMode: boolean;
}

export function planAnswerMode(
  questionMode: AskQQuestionMode | null,
  supportMode: boolean,
  message: string
): AnswerPlan {
  const answerMode = routeShowModeQuestion(questionMode, message);
  return { answerMode, answerSupportMode: supportMode || answerMode === 'app-help' };
}
