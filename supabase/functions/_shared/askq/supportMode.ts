import type { AskQGuideAsset } from './documentContext.ts';
import { isPaymentOrRefundQuestion } from './supportPaymentPolicy.ts';
import {
  MAX_QUOTE_TOKENS,
  MAX_QUOTES,
  MIN_QUOTE_WORDS,
  SUPPORT_ANSWER_MARKER,
  SUPPORT_HANDOFF_MARKER,
  SUPPORT_QUOTE_MARKER,
  type SupportQuoteRefusal,
  type VerifiedGuideQuote,
  verifySupportAnswerQuotes,
} from './supportQuoteEvidence.ts';
import type { ToolDefinition } from './types.ts';

export const SUPPORT_HANDOFF_MESSAGE = 'I need to get a person to help with that.';

const DESTRUCTIVE_ACTION_TERMS = new Set(['delete', 'remove', 'deleted', 'removing', 'deleting']);
const DESTRUCTIVE_ACTION_TARGETS = new Set(['access', 'entry', 'entries', 'member', 'members']);

export type SupportEscalationReason = 'payment_or_refund' | 'low_confidence';

export interface SupportEscalationPayload {
  escalate: true;
  reason: SupportEscalationReason;
  message: string;
}

export function isSupportModeEnabled(value: unknown): boolean {
  return value === true;
}

export function getSupportModeTools(tools: ToolDefinition[]): ToolDefinition[] {
  void tools;
  return [];
}

export function buildSupportModePrompt(basePrompt: string, guides: AskQGuideAsset[]): string {
  const guideIds = guides.map(guide => guide.id).join(', ');
  return `${basePrompt}

SUPPORT MODE:
- The user is asking from the in-app Get Help panel.
- Answer app-help questions only from the verified user-guide context already included in this prompt.
- If the guides answer the question, respond with ${SUPPORT_ANSWER_MARKER} on its own line, then 1 to ${MAX_QUOTES} lines in exactly this form, and nothing else: ${SUPPORT_QUOTE_MARKER} [<guide id>]: "<passage copied exactly from that guide>"
- Write no explanation of your own and do not reword anything: the user is shown only the passages you copy.
- Pick the passages that answer the question: whole steps or whole sentences, in the order a user would follow them, between ${MIN_QUOTE_WORDS} and ${MAX_QUOTE_TOKENS} words each. If a passage is longer than ${MAX_QUOTE_TOKENS} words, split it into separate quote lines at sentence or step boundaries. A passage not found word for word in the named guide rejects the whole answer.
- Valid guide ids: ${guideIds}
- If the guide context does not answer the question, begin the response with ${SUPPORT_HANDOFF_MARKER} on its own line, then say only: "${SUPPORT_HANDOFF_MESSAGE}" Do not guess or invent steps.
- Never answer questions about payments, charges, Stripe, billing, payouts, or refunds. Those must escalate to a human ticket.`;
}

export function getSupportEscalationForQuestion(message: string): SupportEscalationPayload | null {
  if (isPaymentOrRefundQuestion(message)) {
    return {
      escalate: true,
      reason: 'payment_or_refund',
      message: 'Payment and refund questions need a person to review the account context.',
    };
  }
  return hasUnsupportedDestructiveIntent(message) ? getSupportLowConfidenceEscalation() : null;
}

// Guides document removing entries, members and access only; deleting anything else goes to a person.
function hasUnsupportedDestructiveIntent(message: string): boolean {
  const words = message.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return (
    words.some(word => DESTRUCTIVE_ACTION_TERMS.has(word)) &&
    !words.some(word => DESTRUCTIVE_ACTION_TARGETS.has(word))
  );
}

export interface ParsedSupportAnswer {
  answerText: string;
  escalation: SupportEscalationPayload | null;
  /** Why an escalation happened; for logging only, never shown to the user. */
  escalationCause: SupportQuoteRefusal | null;
  guideSources: VerifiedGuideQuote[];
}

export function getSupportLowConfidenceEscalation(): SupportEscalationPayload {
  return {
    escalate: true,
    reason: 'low_confidence',
    message: 'I could not find a verified guide answer for that question.',
  };
}

/** Accepts the answer only when its guide quotes verify against the guide text. */
export function parseSupportAnswer(
  answerText: string,
  guides: AskQGuideAsset[]
): ParsedSupportAnswer {
  const verified = verifySupportAnswerQuotes(answerText, guides);
  if (verified.ok) {
    return {
      answerText: verified.answerText,
      escalation: null,
      escalationCause: null,
      guideSources: verified.guideSources,
    };
  }
  return {
    answerText: answerText.trim(),
    escalation: getSupportLowConfidenceEscalation(),
    escalationCause: verified.reason,
    guideSources: [],
  };
}
