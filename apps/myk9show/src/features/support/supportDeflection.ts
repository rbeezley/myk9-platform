import { isPaymentOrRefundQuestion } from '../../../../../supabase/functions/_shared/askq/supportPaymentPolicy.ts';

export type SupportEscalationReason = 'payment_or_refund' | 'low_confidence';

export interface SupportEscalationEvent {
  escalate: true;
  reason: SupportEscalationReason;
  message: string;
}

export interface SupportDeepLink {
  label: string;
  href: string;
}

export type SupportDeflectionRoute =
  | {
      kind: 'answer';
      answer: string;
      deepLink: SupportDeepLink | null;
      sources: Record<string, unknown[]>;
    }
  | {
      kind: 'escalate';
      reason: SupportEscalationReason;
      message: string;
      question: string;
    };

export interface SupportDeflectionInput {
  question: string;
  answer: string;
  toolsUsed: string[];
  sources: Record<string, unknown[]>;
  escalation?: SupportEscalationEvent | null;
}

const DEEP_LINK_RULES: Array<{ pattern: RegExp; link: SupportDeepLink }> = [
  {
    pattern: /\b(armband|my entries|entry|entries|class change|move[- ]?up)\b/i,
    link: { label: 'My Entries', href: '/exhibitor/entries' },
  },
  {
    pattern: /\b(schedule|trial|class list|running order|run order)\b/i,
    link: { label: 'Show Details', href: '/shows' },
  },
  {
    pattern: /\b(check[- ]?in|score|scoring|ringside|at[- ]?show)\b/i,
    link: { label: 'At Show', href: '/at-show' },
  },
  {
    pattern: /\b(message|announcement|communication)\b/i,
    link: { label: 'Messages', href: '/messages' },
  },
];

export function isSupportPaymentOrRefundQuestion(question: string): boolean {
  return isPaymentOrRefundQuestion(question);
}

export function routeSupportDeflection(input: SupportDeflectionInput): SupportDeflectionRoute {
  if (isSupportPaymentOrRefundQuestion(input.question)) {
    return escalate(input, 'payment_or_refund', 'Payment and refund questions need human review.');
  }

  if (input.escalation) {
    return escalate(input, input.escalation.reason, input.escalation.message);
  }

  const answer = input.answer.trim();
  if (!answer) {
    return escalate(input, 'low_confidence', "I couldn't find a reliable answer for that.");
  }

  return {
    kind: 'answer',
    answer,
    deepLink: inferSupportDeepLink(answer, input.sources.guide),
    sources: input.sources,
  };
}

function escalate(
  input: SupportDeflectionInput,
  reason: SupportEscalationReason,
  message: string
): SupportDeflectionRoute {
  return {
    kind: 'escalate',
    reason,
    message,
    question: input.question,
  };
}

function inferSupportDeepLink(answer: string, guideSources: unknown): SupportDeepLink | null {
  const sources = Array.isArray(guideSources) ? guideSources : [];
  const sourceText = sources
    .map(source => {
      if (!source || typeof source !== 'object') return '';
      const values = source as Record<string, unknown>;
      return [values.section, values.title, values.content].filter(Boolean).join(' ');
    })
    .join(' ');
  const haystack = `${answer} ${sourceText}`;

  return DEEP_LINK_RULES.find(rule => rule.pattern.test(haystack))?.link ?? null;
}
