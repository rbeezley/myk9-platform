import type { AskQGuideAsset } from './documentContext.ts';
import type { ToolDefinition } from './types.ts';

export const SUPPORT_HANDOFF_MESSAGE = 'I need to get a person to help with that.';
const SUPPORT_ANSWER_MARKER = 'SUPPORT_ANSWER';
const SUPPORT_HANDOFF_MARKER = 'SUPPORT_HANDOFF';

export const SUPPORT_PAYMENT_REFUND_PATTERN_SOURCE =
  String.raw`\b(payment|payments|paid|paying|charge|charged|charges|refund|refunded|refunds|stripe|checkout|credit card|debit card|card declined|invoice|billing|payout|withdrawal|transaction|receipt)\b`;

const PAYMENT_REFUND_PATTERN = new RegExp(SUPPORT_PAYMENT_REFUND_PATTERN_SOURCE, 'i');
const MIN_GUIDE_EVIDENCE_MATCHES = 2;
const MAX_GUIDE_EVIDENCE_SPAN = 4;
const DESTRUCTIVE_ACTION_TERMS = new Set(['delete', 'remove']);
const DESTRUCTIVE_ACTION_TARGETS = new Set(['access', 'entry', 'member']);
const SUPPORT_TERM_NORMALIZATIONS: Record<string, string> = {
  adding: 'add',
  creates: 'create',
  creating: 'create',
  deleted: 'delete',
  deletes: 'delete',
  managing: 'manage',
  removing: 'remove',
};
const SUPPORT_DOMAIN_TERMS = new Set([
  'add',
  'armband',
  'catalog',
  'checkin',
  'class',
  'classes',
  'communication',
  'create',
  'dog',
  'dogs',
  'entry',
  'entries',
  'exhibitor',
  'judge',
  'mail',
  'manage',
  'message',
  'premium',
  'report',
  'reports',
  'result',
  'results',
  'schedule',
  'score',
  'scoring',
  'secretary',
  'send',
  'show',
  'steward',
  'waitlist',
]);

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
      const matchedTerms = findCloseGuideMatchedTerms(terms, tokenizeGuideText(guide));
      return {
        id: guide.id,
        title: guide.title,
        audience: guide.audience,
        matchedTerms,
      };
    })
    .filter(
      evidence =>
        evidence.matchedTerms.length >= MIN_GUIDE_EVIDENCE_MATCHES &&
        evidence.matchedTerms.some(term => SUPPORT_DOMAIN_TERMS.has(term))
    )
    .sort((a, b) => b.matchedTerms.length - a.matchedTerms.length)
    .slice(0, 3);
}

function findCloseGuideMatchedTerms(queryTerms: string[], guideTerms: string[]): string[] {
  let bestMatchedTerms: string[] = [];
  for (let start = 0; start < guideTerms.length; start += 1) {
    const windowTerms = new Set(guideTerms.slice(start, start + MAX_GUIDE_EVIDENCE_SPAN + 1));
    const matchedTerms = queryTerms.filter(term => windowTerms.has(term));
    if (
      matchedTerms.length >= MIN_GUIDE_EVIDENCE_MATCHES &&
      matchedTerms.some(term => SUPPORT_DOMAIN_TERMS.has(term)) &&
      hasSupportedDestructiveIntent(queryTerms, matchedTerms)
    ) {
      if (matchedTerms.length > bestMatchedTerms.length) {
        bestMatchedTerms = matchedTerms;
      }
    }
  }

  return bestMatchedTerms;
}

function hasSupportedDestructiveIntent(queryTerms: string[], matchedTerms: string[]): boolean {
  const destructiveTerms = queryTerms.filter(term => DESTRUCTIVE_ACTION_TERMS.has(term));
  if (destructiveTerms.length === 0) return true;

  return (
    destructiveTerms.some(term => matchedTerms.includes(term)) &&
    matchedTerms.some(term => DESTRUCTIVE_ACTION_TARGETS.has(term))
  );
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
    'are',
    'could',
    'can',
    'did',
    'does',
    'doing',
    'done',
    'get',
    'gets',
    'getting',
    'got',
    'find',
    'from',
    'help',
    'how',
    'into',
    'need',
    'please',
    'support',
    'supports',
    'supported',
    'supporting',
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
    'you',
    'your',
  ]);

  return [
    ...new Set(
      `${message} ${getSupportQueryAliases(message).join(' ')}`
        .toLowerCase()
        .match(/[a-z0-9]+/g)
        ?.map(normalizeSupportTerm)
        .filter(term => term.length >= 3 && !stopWords.has(term)) ?? []
    ),
  ];
}

function getSupportQueryAliases(message: string): string[] {
  const normalized = message.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  if (/\bcheck\s+in\b/.test(normalized)) return ['check', 'exhibitor'];
  return [];
}

function tokenizeGuideText(guide: AskQGuideAsset): string[] {
  return (
    `${guide.title} ${guide.audience} ${guide.content}`
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.map(normalizeSupportTerm) ?? []
  );
}

function normalizeSupportTerm(term: string): string {
  return SUPPORT_TERM_NORMALIZATIONS[term] ?? term;
}
