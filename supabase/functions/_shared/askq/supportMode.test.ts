import { describe, expect, it } from 'vitest';
import {
  SUPPORT_HANDOFF_MESSAGE,
  buildSupportModePrompt,
  getSupportEscalationForQuestion,
  getSupportModeTools,
  parseSupportAnswer,
} from './supportMode.ts';
import { ASKQ_GUIDES } from './documentAssets.ts';
import { isPaymentOrRefundQuestion } from './supportPaymentPolicy.ts';
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

  // MYK9-2505: how-it-works money questions reach the guide path; account-specific ones escalate.
  it.each([
    'Does Stripe need my full Social Security number?',
    'When do we get paid, and does myK9Show take a cut?',
    'A dog was pulled. How do I refund the exhibitor?',
  ])('sends the guide-policy money question to the guide path: %s', question => {
    expect(isPaymentOrRefundQuestion(question)).toBe(true);
    expect(getSupportEscalationForQuestion(question)).toBeNull();
  });

  it.each([
    'Where is my refund for Heartland?',
    'Why was I charged twice?',
    'When will my payout for last weekend arrive?',
    'Can you refund my Stripe payment?',
    'I have not received my payout yet',
    'I was charged $45 for an entry',
  ])('escalates the account-specific money question: %s', question => {
    expect(getSupportEscalationForQuestion(question)).toMatchObject({
      escalate: true,
      reason: 'payment_or_refund',
      message: 'Payment and refund questions need a person to review the account context.',
    });
  });

  it('disables live data tools in support mode because guides are bundled in the prompt', () => {
    expect(getSupportModeTools(tools)).toEqual([]);
  });

  it('injects the human-escalation payment rule into the server prompt', () => {
    const prompt = buildSupportModePrompt('base prompt', ASKQ_GUIDES);

    expect(prompt).toContain('Never answer questions about payments');
    expect(prompt).toContain('must escalate to a human ticket');
    expect(prompt).toContain('verified user-guide context');
    expect(prompt).toContain('SUPPORT_ANSWER');
    expect(prompt).toContain('SUPPORT_HANDOFF');
    expect(prompt).toContain('SUPPORT_QUOTE [<guide id>]:');
    // MYK9-1679: the multi-area passage is over the maximum, so the model must know to split it.
    expect(prompt).toContain('between 8 and 120 words each');
    expect(prompt).toContain('split it into separate quote lines');
    expect(prompt).toContain('1 to 3 lines');
    expect(prompt).toContain('Write no explanation of your own');
  });

  it('lists every guide id in the prompt', () => {
    const prompt = buildSupportModePrompt('base prompt', ASKQ_GUIDES);
    for (const guide of ASKQ_GUIDES) expect(prompt).toContain(guide.id);
  });

  // Questions the guides do not answer reach the model, which hands off; quotes decide acceptance.
  it('lets ordinary app-help questions through to the model', () => {
    for (const question of [
      'how do I time a two-area search?',
      'How do I change my time zone?',
      "How do I search for another user's email?",
      'How do I remove show access for a member?',
    ]) {
      expect(getSupportEscalationForQuestion(question)).toBeNull();
    }
  });

  it('escalates destructive questions before the model unless they target access, entries or members', () => {
    for (const question of [
      'Can I delete my account?',
      'How do I delete my dog profile?',
      'How do I remove a dog?',
    ]) {
      expect(getSupportEscalationForQuestion(question)).toMatchObject({
        escalate: true,
        reason: 'low_confidence',
      });
    }
  });

  it('checks payment before the destructive guard', () => {
    expect(getSupportEscalationForQuestion('Delete my card and refund me')).toMatchObject({
      reason: 'payment_or_refund',
    });
  });

  it('accepts a verified answer and shows only the quoted passage', () => {
    const quote = "Before you tap Save, check that every area's field has a time.";
    const parsed = parseSupportAnswer(
      `SUPPORT_ANSWER\nTime each area, then record the area time.\nSUPPORT_QUOTE [judge-steward-quickstart]: "${quote}"`,
      ASKQ_GUIDES
    );
    expect(parsed.escalation).toBeNull();
    expect(parsed.answerText).toBe(`From the Ringside Quickstart:\n“${quote}”`);
    expect(parsed.guideSources).toEqual([
      expect.objectContaining({ id: 'judge-steward-quickstart', quote, content: quote }),
    ]);
  });

  it('escalates handoffs, unquoted answers and plain text with the low-confidence payload', () => {
    for (const text of [
      `SUPPORT_HANDOFF\n${SUPPORT_HANDOFF_MESSAGE}`,
      'SUPPORT_ANSWER\nOpen Entries Management.',
      'Open Entries Management.',
      '',
    ]) {
      expect(parseSupportAnswer(text, ASKQ_GUIDES)).toMatchObject({
        escalation: { escalate: true, reason: 'low_confidence' },
        guideSources: [],
      });
    }
  });

  it('records why it escalated, for the log only', () => {
    expect(
      parseSupportAnswer(`SUPPORT_HANDOFF\n${SUPPORT_HANDOFF_MESSAGE}`, ASKQ_GUIDES)
    ).toMatchObject({
      escalationCause: 'handoff',
    });
    expect(
      parseSupportAnswer('SUPPORT_ANSWER\nOpen Entries Management.', ASKQ_GUIDES)
    ).toMatchObject({
      escalationCause: 'quote_rejected',
      escalation: { reason: 'low_confidence' },
    });
  });
});
