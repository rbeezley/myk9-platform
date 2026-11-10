import {
  buildDocumentContext,
  type AskQGuideAsset,
  type AskQRulebookAsset,
} from './documentContext.ts';
import { APP_HELP_GROUNDING_RULES, SHOW_DATA_GROUNDING_RULES } from './groundingRules.ts';
import { buildMyK9ShowPrompt } from './myK9ShowPrompt.ts';
import { scopeGuidesToRole } from './guideScope.ts';
import { buildSupportModePrompt } from './supportMode.ts';
import type { UserContext } from './types.ts';

const GUIDES_SOURCE = `
SOURCE: App guides.
- Answer only from verified_user_guides.
- Do not use live show-data tools.
- Ignore any part of the question about official rules or this show's live state; those are answered separately.
`;

const RULEBOOK_SOURCE = `
SOURCE: Official rulebook.
- Answer only from selected_rulebook.
- Start the answer with a concise source label, for example: "Using AKC Scent Work rules:".
- Do not use live show-data tools or app steps.
- Ignore any part of the question about how to use the app or this show's live state; those are answered separately.
- If selected_rulebook does not cover the question, say you cannot determine it from the rulebook.
`;

const SHOW_DATA_SOURCE = `
SOURCE: Live show data.
- Use get_class_summary, get_entry_results, get_trial_overview or search_entries for results, entries, classes, trials and schedules.
- Ignore any part of the question about official rules or how to use the app; those are answered separately.
`;

export interface GuidesPromptInput {
  userContext: UserContext;
  hasStaffRole: boolean;
  allGuides: AskQGuideAsset[];
}

/** Role-scoped guides, no rulebook, no tools; the answer is shown only if its quotes verify. */
export function buildGuidesPrompt(input: GuidesPromptInput): {
  systemPrompt: string;
  guides: AskQGuideAsset[];
} {
  const guides = scopeGuidesToRole(input.allGuides, input.hasStaffRole);
  const documentContext = buildDocumentContext({ guides, omitRulebookSection: true });
  const base = `${buildMyK9ShowPrompt(input.userContext, documentContext)}${GUIDES_SOURCE}${APP_HELP_GROUNDING_RULES}`;
  return { systemPrompt: buildSupportModePrompt(base, guides), guides };
}

/** The selected rulebook only: no guides, no tools. */
export function buildRulebookPrompt(input: {
  userContext: UserContext;
  rulebooks: AskQRulebookAsset[];
}): string {
  const documentContext = buildDocumentContext({ guides: [], rulebooks: input.rulebooks });
  return `${buildMyK9ShowPrompt(input.userContext, documentContext)}${RULEBOOK_SOURCE}`;
}

/** Tools only: no guide or rulebook text in the prompt. */
export function buildShowDataPrompt(input: { userContext: UserContext }): string {
  return `${buildMyK9ShowPrompt(input.userContext, '')}${SHOW_DATA_SOURCE}${SHOW_DATA_GROUNDING_RULES}`;
}
