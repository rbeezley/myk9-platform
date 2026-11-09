import type { AskQGuideAsset, AskQRulebookAsset } from './documentContext.ts';
import { TOOLS } from './toolDefinitions.ts';
import type { AskQQuestionMode, ToolDefinition } from './types.ts';
import { parseSupportAnswer, type ParsedSupportAnswer } from './supportMode.ts';
import {
  MAX_QUOTE_TOKENS,
  MAX_QUOTES,
  MIN_QUOTE_WORDS,
  SUPPORT_ANSWER_MARKER,
  SUPPORT_QUOTE_MARKER,
} from './supportQuoteEvidence.ts';

// MYK9-1775: "This show" is the panel's default on a show page, so people ask it
// show facts, how-to questions and rules questions in one box. Rather than guess
// per question which one it is (a miss would take the live-data tools away), the
// mode keeps the tools AND carries the role-scoped guides and this show's rulebook.

/** Appended to the This show prompt when guides are in context. */
export function buildShowDataDocumentPrompt(guides: AskQGuideAsset[]): string {
  const guideIds = guides.map(guide => guide.id).join(', ');
  return `
DOCUMENTS IN THIS MODE:
- Show facts (results, entries, classes, schedules, status) come from the show-data tools. Use the tools; never answer a show fact from the documents.
- App how-to and policy questions (withdrawing or pulling, refunds, fees, deadlines, where to tap) are answered only from verified_user_guides. Official rules questions are answered only from selected_rulebook, starting with a source label such as "Using AKC Scent Work rules:".
- To answer from a guide, respond with ${SUPPORT_ANSWER_MARKER} on its own line, then 1 to ${MAX_QUOTES} lines in exactly this form, and nothing else: ${SUPPORT_QUOTE_MARKER} [<guide id>]: "<passage copied exactly from that guide>"
- Write no explanation of your own on a guide answer and do not reword anything: the user is shown only the passages you copy. Pick whole steps or sentences, between ${MIN_QUOTE_WORDS} and ${MAX_QUOTE_TOKENS} words each, in the order a user would follow them. A passage not found word for word in the named guide rejects the whole answer.
- Valid guide ids: ${guideIds}
- If neither the tools nor the documents answer the question, say plainly that it is not covered. Do not guess, and do not send the user to another mode.
`;
}

const ANSWER_MARKER_LINE = new RegExp(`^[^A-Za-z0-9]*${SUPPORT_ANSWER_MARKER}\\b`);

/**
 * A This show reply that starts with the guide-answer marker is a guide answer and
 * its quotes are verified against the guides; any other reply is a tool or rulebook
 * answer and passes through unchanged.
 */
export function parseShowDataAnswer(
  answerText: string,
  guides: AskQGuideAsset[]
): ParsedSupportAnswer {
  const firstLine = answerText.split('\n').find(line => line.trim()) ?? '';
  if (ANSWER_MARKER_LINE.test(firstLine)) return parseSupportAnswer(answerText, guides);
  return { answerText, escalation: null, escalationCause: null, guideSources: [] };
}

/** App help and Rules answer from documents alone; every other mode, This show included, keeps the tools. */
export function getActiveTools(
  questionMode: AskQQuestionMode | null,
  effectiveSupportMode: boolean
): ToolDefinition[] {
  if (effectiveSupportMode || questionMode === 'rules') return [];
  return TOOLS;
}

export function getDocumentRulebooks(
  questionMode: AskQQuestionMode | null,
  rulebooks: AskQRulebookAsset[]
): AskQRulebookAsset[] {
  if (questionMode === 'app-help') return [];
  return rulebooks;
}
