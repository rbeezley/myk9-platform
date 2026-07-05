import { describe, expect, it } from 'vitest';
import {
  buildSupportModePrompt,
  getSupportEscalationForAnswer,
  getSupportEscalationForQuestion,
  getSupportModeTools,
  isPaymentOrRefundQuestion,
} from './supportMode.ts';
import type { ToolDefinition } from './types.ts';

const tools: ToolDefinition[] = [
  {
    name: 'search_rules',
    description: '',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'search_user_guide',
    description: '',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
];

describe('AskQ support mode', () => {
  it('flags payment and refund questions before model routing', () => {
    expect(isPaymentOrRefundQuestion('Can you refund my Stripe payment?')).toBe(true);
    expect(getSupportEscalationForQuestion('My card was charged twice')).toMatchObject({
      escalate: true,
      reason: 'payment_or_refund',
    });
  });

  it('restricts support mode to the verified guide tool', () => {
    expect(getSupportModeTools(tools).map(tool => tool.name)).toEqual(['search_user_guide']);
  });

  it('injects the human-escalation payment rule into the server prompt', () => {
    const prompt = buildSupportModePrompt('base prompt');

    expect(prompt).toContain('Never answer questions about payments');
    expect(prompt).toContain('must escalate to a human ticket');
  });

  it('allows only answers grounded by guide sources', () => {
    expect(
      getSupportEscalationForAnswer(['search_user_guide'], { guide: [{ title: 'Guide' }] })
    ).toBeNull();
    expect(getSupportEscalationForAnswer(['search_user_guide'], { guide: [] })).toMatchObject({
      reason: 'low_confidence',
    });
    expect(getSupportEscalationForAnswer([], {})).toMatchObject({ reason: 'low_confidence' });
  });
});
