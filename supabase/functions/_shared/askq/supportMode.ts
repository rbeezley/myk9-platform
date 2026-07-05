import type { AskQGuideAsset } from './documentContext.ts';
import type { ToolDefinition } from './types.ts';

export const SUPPORT_HANDOFF_MESSAGE = 'I need to get a person to help with that.';
const SUPPORT_ANSWER_MARKER = 'SUPPORT_ANSWER';
const SUPPORT_HANDOFF_MARKER = 'SUPPORT_HANDOFF';

export const SUPPORT_PAYMENT_REFUND_PATTERN_SOURCE =
  String.raw`\b(payment|payments|paid|paying|charge|charged|charges|refund|refunded|refunds|stripe|checkout|credit card|debit card|card declined|invoice|billing|payout|withdrawal|transaction|receipt)\b`;

const PAYMENT_REFUND_PATTERN = new RegExp(SUPPORT_PAYMENT_REFUND_PATTERN_SOURCE, 'i');

export type SupportEscalationReason = 'payment_or_refund' | 'low_confidence';

export interface SupportEscalationPayload {
  escalate: true;
  reason: SupportEscalationReason;
  message: string;
}

export interface SupportGuideEvidence {
  id: string;
  title: string;
  audience: string;
  matchedTerms: string[];
}

export function isSupportModeEnabled(value: unknown): boolean {
  return value === true;
}

export function isPaymentOrRefundQuestion(message: string): boolean {
  return PAYMENT_REFUND_PATTERN.test(message);
}

export function getSupportModeTools(tools: ToolDefinition[]): ToolDefinition[] {
  void tools;
  return [];
}

export function buildSupportModePrompt(basePrompt: string): string {
  return `${basePrompt}

SUPPORT MODE:
- The user is asking from the in-app Get Help panel.
- Answer app-help questions only from the verified user-guide context already included in this prompt.
- If the guide context answers the question, begin the response with ${SUPPORT_ANSWER_MARKER} on its own line, then give the answer.
- If the guide context does not answer the question, begin the response with ${SUPPORT_HANDOFF_MARKER} on its own line, then say only: "${SUPPORT_HANDOFF_MESSAGE}" Do not guess or invent steps.
- Never answer questions about payments, charges, Stripe, billing, payouts, or refunds. Those must escalate to a human ticket.`;
}

export function getSupportEscalationForQuestion(message: string): SupportEscalationPayload | null {
  if (!isPaymentOrRefundQuestion(message)) return null;
  return {
    escalate: true,
    reason: 'payment_or_refund',
    message: 'Payment and refund questions need a person to review the account context.',
  };
}

export interface ParsedSupportAnswer {
  answerText: string;
  escalation: SupportEscalationPayload | null;
}

export function findSupportGuideEvidence(
  message: string,
  guides: AskQGuideAsset[]
): SupportGuideEvidence[] {
  const terms = tokenizeSupportQuery(message);
  if (terms.length === 0) return [];

  return guides
    .map(guide => {
      const haystack = `${guide.title} ${guide.audience} ${guide.content}`.toLowerCase();
      const matchedTerms = terms.filter(term => haystack.includes(term));
      return {
        id: guide.id,
        title: guide.title,
        audience: guide.audience,
        matchedTerms,
      };
    })
    .filter(evidence => evidence.matchedTerms.length > 0)
    .sort((a, b) => b.matchedTerms.length - a.matchedTerms.length)
    .slice(0, 3);
}

export function parseSupportAnswer(
  answerText: string,
  hasGuideEvidence = false
): ParsedSupportAnswer {
  const trimmed = answerText.trim();
  if (hasGuideEvidence && trimmed.startsWith(SUPPORT_ANSWER_MARKER)) {
    const stripped = trimmed.slice(SUPPORT_ANSWER_MARKER.length).trim();
    if (stripped) return { answerText: stripped, escalation: null };
  }

  return {
    answerText: trimmed,
    escalation: getSupportEscalationForAnswer(trimmed),
  };
}

export function getSupportEscalationForAnswer(
  answerText: string,
  hasGuideEvidence = false
): SupportEscalationPayload | null {
  const trimmed = answerText.trim();
  if (
    hasGuideEvidence &&
    trimmed.startsWith(SUPPORT_ANSWER_MARKER) &&
    trimmed.slice(SUPPORT_ANSWER_MARKER.length).trim()
  ) {
    return null;
  }

  return {
    escalate: true,
    reason: 'low_confidence',
    message: 'I could not find a verified guide answer for that question.',
  };
}

function tokenizeSupportQuery(message: string): string[] {
  const stopWords = new Set([
    'about',
    'another',
    'could',
    'does',
    'find',
    'from',
    'help',
    'into',
    'need',
    'please',
    'show',
    'that',
    'their',
    'there',
    'this',
    'what',
    'when',
    'where',
    'which',
    'with',
    'would',
    'your',
  ]);

  return [
    ...new Set(
      message
        .toLowerCase()
        .match(/[a-z0-9]+/g)
        ?.filter(term => term.length >= 3 && !stopWords.has(term)) ?? []
    ),
  ];
}
