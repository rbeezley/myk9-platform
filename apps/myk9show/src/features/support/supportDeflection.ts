const GUIDE_TOOL = 'search_user_guide';
const PAYMENT_REFUND_PATTERN =
  /\b(payment|payments|paid|paying|charge|charged|charges|refund|refunded|refunds|stripe|checkout|credit card|debit card|card declined|invoice|billing|payout|withdrawal|transaction|receipt)\b/i;

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
  return PAYMENT_REFUND_PATTERN.test(question);
}

export function routeSupportDeflection(input: SupportDeflectionInput): SupportDeflectionRoute {
  if (isSupportPaymentOrRefundQuestion(input.question)) {
    return escalate(input, 'payment_or_refund', 'Payment and refund questions need human review.');
  }

  if (input.escalation) {
    return escalate(input, input.escalation.reason, input.escalation.message);
  }

  const guideSources = Array.isArray(input.sources.guide) ? input.sources.guide : [];
  const answer = input.answer.trim();
  const isGrounded = input.toolsUsed.includes(GUIDE_TOOL) && guideSources.length > 0;
  if (!answer || !isGrounded) {
    return escalate(input, 'low_confidence', 'No verified guide answer was found.');
  }

  return {
    kind: 'answer',
    answer,
    deepLink: inferSupportDeepLink(answer, guideSources),
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

function inferSupportDeepLink(answer: string, guideSources: unknown[]): SupportDeepLink | null {
  const sourceText = guideSources
    .map(source => {
      if (!source || typeof source !== 'object') return '';
      const values = source as Record<string, unknown>;
      return [values.section, values.title, values.content].filter(Boolean).join(' ');
    })
    .join(' ');
  const haystack = `${answer} ${sourceText}`;

  return DEEP_LINK_RULES.find(rule => rule.pattern.test(haystack))?.link ?? null;
}
