import {
  buildDocumentContext,
  type AskQGuideAsset,
  type AskQRulebookAsset,
} from './documentContext.ts';
import { buildGroundingPrompt } from './groundingRules.ts';
import { getDocumentGuides } from './guideScope.ts';
import { buildMyK9ShowPrompt } from './myK9ShowPrompt.ts';
import { buildModePrompt } from './requestRouting.ts';
import { buildSupportModePrompt } from './supportMode.ts';
import type { AskQQuestionMode, UserContext } from './types.ts';

export interface AskQSystemPromptInput {
  userContext: UserContext;
  questionMode: AskQQuestionMode | null;
  effectiveSupportMode: boolean;
  isShowManager: boolean;
  allGuides: AskQGuideAsset[];
  rulebooks: AskQRulebookAsset[];
}

/** Assembles the system prompt and the guides it quotes, so a test sees what the model sees. */
export function buildAskQSystemPrompt(input: AskQSystemPromptInput): {
  systemPrompt: string;
  guides: AskQGuideAsset[];
} {
  const guides = getDocumentGuides(input.allGuides, input.questionMode, input.isShowManager);
  const documentContext = buildDocumentContext({ guides, rulebooks: input.rulebooks });
  const base = `${buildMyK9ShowPrompt(input.userContext, documentContext)}${buildModePrompt(input.questionMode)}${buildGroundingPrompt(input.questionMode, input.effectiveSupportMode)}`;
  const systemPrompt = input.effectiveSupportMode ? buildSupportModePrompt(base, guides) : base;
  return { systemPrompt, guides };
}
