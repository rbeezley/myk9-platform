import { describe, expect, it } from 'vitest';
import {
  SUPPORT_HANDOFF_MESSAGE,
  buildSupportModePrompt,
  getSupportEscalationForAnswer,
  getSupportEscalationForQuestion,
  getSupportModeTools,
  isPaymentOrRefundQuestion,
  parseSupportAnswer,
} from './supportMode.ts';
import type { ToolDefinition } from './types.ts';

const tools: ToolDefinition[] = [
  {
    name: 'get_entry_results',
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

  it('disables live data tools in support mode because guides are bundled in the prompt', () => {
    expect(getSupportModeTools(tools)).toEqual([]);
  });

  it('injects the human-escalation payment rule into the server prompt', () => {
    const prompt = buildSupportModePrompt('base prompt');

    expect(prompt).toContain('Never answer questions about payments');
    expect(prompt).toContain('must escalate to a human ticket');
    expect(prompt).toContain('verified user-guide context');
    expect(prompt).toContain('SUPPORT_ANSWER');
    expect(prompt).toContain('SUPPORT_HANDOFF');
  });

  it('fails closed unless the model marks the response as a guide-backed answer', () => {
    expect(getSupportEscalationForAnswer('SUPPORT_ANSWER\nOpen Entries Management.')).toBeNull();
    expect(getSupportEscalationForAnswer(SUPPORT_HANDOFF_MESSAGE)).toMatchObject({
      reason: 'low_confidence',
    });
    expect(getSupportEscalationForAnswer('Open Entries Management.')).toMatchObject({
      reason: 'low_confidence',
    });
    expect(getSupportEscalationForAnswer('')).toMatchObject({ reason: 'low_confidence' });
  });

  it('strips the support answer marker before streaming the response', () => {
    expect(parseSupportAnswer('SUPPORT_ANSWER\nOpen Entries Management.')).toEqual({
      answerText: 'Open Entries Management.',
      escalation: null,
    });
    expect(parseSupportAnswer('SUPPORT_HANDOFF\nI need help.').escalation).toMatchObject({
      reason: 'low_confidence',
    });
  });
});
