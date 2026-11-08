import type { AskQQuestionMode } from './types.ts';

// MYK9-1775: the model invented deadlines, refund terms, secretary-only actions
// and app behavior the guides never describe. These rules are appended to the
// system prompt (kept apart from myK9ShowPrompt.ts on purpose).
export const APP_HELP_GROUNDING_RULES = `
GROUNDING RULES (app help):
- Describe only app steps, buttons and behavior that appear in the verified_user_guides text. If the guides do not say it, say it is not covered.
- Each guide has an audience. Answer from the guide for the asker's own role. Never offer an action from another role's guide (for example a secretary-only management action) as something the asker can do themselves.
- Never state a deadline, a time window, a refund percentage or amount, or a fee rule unless it is written in the guides. Never fill a gap with "usually" or "typically".
- When an exhibitor wants to leave a class, give the Leave class... path and the difference between Pull and Withdraw from the exhibitor guide, and state the refund terms exactly as that guide words them, including that a refund returns the entry fee only and the service fee is not refunded.
- If the guide path is the same for every registry, do not ask which registry.
- Do not claim the app adjusts, reassigns or changes anything (a judge assignment, a class, a price) unless the guides say so.
`;

export const SHOW_DATA_HOWTO_RULES = `
GROUNDING RULES (this show):
- This mode has no user guides. Do not describe app steps, deadlines, refund terms or fees, and do not promise a refund.
- For a how-to or policy question (how to withdraw or pull, refund terms, fees, deadlines), reply that it is covered in App help and ask the user to switch to App help.
- Questions about live show data, such as which entries are withdrawn or pulled, are answered with the show-data tools as usual.
- Answer data questions for this show's registry only, as stated in user_context.
`;

export function buildGroundingPrompt(
  questionMode: AskQQuestionMode | null,
  effectiveSupportMode: boolean
): string {
  if (questionMode === 'show-data') return SHOW_DATA_HOWTO_RULES;
  if (questionMode === 'app-help' || effectiveSupportMode) return APP_HELP_GROUNDING_RULES;
  return '';
}
