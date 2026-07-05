import type { ChatResponse, ToolDefinition } from './types.ts';

export const SUPPORT_GUIDE_TOOL = 'search_user_guide';

export const SUPPORT_PAYMENT_REFUND_PATTERN_SOURCE =
  String.raw`\b(payment|payments|paid|paying|charge|charged|charges|refund|refunded|refunds|stripe|checkout|credit card|debit card|card declined|invoice|billing|payout|withdrawal|transaction|receipt)\b`;

const PAYMENT_REFUND_PATTERN = new RegExp(SUPPORT_PAYMENT_REFUND_PATTERN_SOURCE, 'i');

export type SupportEscalationReason = 'payment_or_refund' | 'low_confidence';

export interface SupportEscalationPayload {
  escalate: true;
  reason: SupportEscalationReason;
  message: string;
}

export function isSupportModeEnabled(value: unknown): boolean {
  return value === true;
}

export function isPaymentOrRefundQuestion(message: string): boolean {
  return PAYMENT_REFUND_PATTERN.test(message);
}

export function getSupportModeTools(tools: ToolDefinition[]): ToolDefinition[] {
  return tools.filter(tool => tool.name === SUPPORT_GUIDE_TOOL);
}

export function buildSupportModePrompt(basePrompt: string): string {
  return `${basePrompt}

SUPPORT MODE:
- The user is asking from the in-app Get Help panel.
- Use ${SUPPORT_GUIDE_TOOL} before answering. Ground app-help answers only in verified user-guide content returned by that tool.
- If the guide content does not answer the question, say only: "I need to get a person to help with that." Do not guess or invent steps.
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

export function getSupportEscalationForAnswer(
  toolsUsed: string[],
  sources: ChatResponse['sources']
): SupportEscalationPayload | null {
  const guideSources = Array.isArray(sources?.guide) ? sources.guide : [];
  if (toolsUsed.includes(SUPPORT_GUIDE_TOOL) && guideSources.length > 0) {
    return null;
  }

  return {
    escalate: true,
    reason: 'low_confidence',
    message: 'I could not find a verified guide answer for that question.',
  };
}
