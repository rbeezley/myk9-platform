import { describe, expect, it } from 'vitest';
import {
  SUPPORT_HANDOFF_MESSAGE,
  buildSupportModePrompt,
  findSupportGuideEvidence,
  getSupportEscalationForAnswer,
  getSupportEscalationForQuestion,
  getSupportModeTools,
  isPaymentOrRefundQuestion,
  parseSupportAnswer,
} from './supportMode.ts';
import { ASKQ_GUIDES } from './documentAssets.ts';
import type { AskQGuideAsset } from './documentContext.ts';
import type { ToolDefinition } from './types.ts';

const tools: ToolDefinition[] = [
  {
    name: 'get_entry_results',
    description: '',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
];

const guides: AskQGuideAsset[] = [
  {
    id: 'secretary-guide',
    title: 'Secretary Guide',
    audience: 'Trial secretaries',
    content: 'Open Entries Management and choose Add mail-in entry.',
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

  it('finds server-side guide evidence before support answers can be accepted', () => {
    expect(findSupportGuideEvidence('How do I add a mail-in entry?', guides)).toEqual([
      expect.objectContaining({
        id: 'secretary-guide',
        matchedTerms: expect.arrayContaining(['add', 'mail', 'entry']),
      }),
    ]);
    expect(findSupportGuideEvidence('How do I get a refund?', guides)).toEqual([]);
  });

  it('rejects unsupported questions that overlap with real guide vocabulary', () => {
    expect(findSupportGuideEvidence('Can I delete my account?', ASKQ_GUIDES)).toEqual([]);
    expect(findSupportGuideEvidence('Do you support agility trials?', ASKQ_GUIDES)).toEqual([]);
    expect(findSupportGuideEvidence('How do I remove a dog?', ASKQ_GUIDES)).toEqual([]);
    expect(findSupportGuideEvidence('How do I delete my dog profile?', ASKQ_GUIDES)).toEqual([]);
  });

  it('finds evidence for documented support-guide workflows', () => {
    expect(findSupportGuideEvidence('How do I create a show?', ASKQ_GUIDES)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'secretary-guide',
          matchedTerms: expect.arrayContaining(['create', 'show']),
        }),
      ])
    );
    expect(findSupportGuideEvidence('How do I send a message?', ASKQ_GUIDES)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'secretary-guide',
          matchedTerms: expect.arrayContaining(['send', 'message']),
        }),
      ])
    );
    expect(findSupportGuideEvidence('How do I check in?', ASKQ_GUIDES)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'secretary-guide',
          matchedTerms: expect.arrayContaining(['check', 'exhibitor']),
        }),
      ])
    );
    expect(findSupportGuideEvidence('How do I manage the waitlist?', ASKQ_GUIDES)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'secretary-guide',
          matchedTerms: expect.arrayContaining(['manage', 'waitlist']),
        }),
      ])
    );
  });

  it('fails closed unless a marked answer also has server-side guide evidence', () => {
    expect(getSupportEscalationForAnswer('SUPPORT_ANSWER\nOpen Entries Management.')).toMatchObject(
      {
        reason: 'low_confidence',
      }
    );
    expect(getSupportEscalationForAnswer('SUPPORT_ANSWER\nOpen Entries Management.', true)).toBeNull();
    expect(getSupportEscalationForAnswer(SUPPORT_HANDOFF_MESSAGE)).toMatchObject({
      reason: 'low_confidence',
    });
    expect(getSupportEscalationForAnswer('Open Entries Management.')).toMatchObject({
      reason: 'low_confidence',
    });
    expect(getSupportEscalationForAnswer('')).toMatchObject({ reason: 'low_confidence' });
  });

  it('strips the support answer marker before streaming the response', () => {
    expect(parseSupportAnswer('SUPPORT_ANSWER\nOpen Entries Management.', true)).toEqual({
      answerText: 'Open Entries Management.',
      escalation: null,
    });
    expect(parseSupportAnswer('SUPPORT_ANSWER\nOpen Entries Management.').escalation).toMatchObject(
      {
        reason: 'low_confidence',
      }
    );
    expect(parseSupportAnswer('SUPPORT_HANDOFF\nI need help.').escalation).toMatchObject({
      reason: 'low_confidence',
    });
  });
});
