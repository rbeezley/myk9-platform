import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SUPPORT_PAYMENT_REFUND_PATTERN_SOURCE,
  isSupportPaymentOrRefundQuestion,
  routeSupportDeflection,
  type SupportEscalationEvent,
} from './supportDeflection';

function extractServerPatternSource(): string {
  const serverSource = readFileSync(
    resolve(__dirname, '../../../../../supabase/functions/_shared/askq/supportMode.ts'),
    'utf8'
  );
  const match = serverSource.match(
    /SUPPORT_PAYMENT_REFUND_PATTERN_SOURCE\s*=\s*String\.raw`([^`]+)`/
  );
  expect(match?.[1]).toBeTruthy();
  return match?.[1] ?? '';
}

describe('support deflection routing', () => {
  it('escalates payment and refund questions even if an answer was streamed', () => {
    const route = routeSupportDeflection({
      question: 'Can you refund the card I paid with?',
      answer: 'Open My Entries and click...',
      toolsUsed: [],
      sources: {},
    });

    expect(isSupportPaymentOrRefundQuestion('Stripe checkout charged me twice')).toBe(true);
    expect(route).toMatchObject({
      kind: 'escalate',
      reason: 'payment_or_refund',
      question: 'Can you refund the card I paid with?',
    });
  });

  it('uses the server escalation signal when present', () => {
    const escalation: SupportEscalationEvent = {
      escalate: true,
      reason: 'low_confidence',
      message: 'I could not find a verified guide answer.',
    };

    expect(
      routeSupportDeflection({
        question: 'Can the secretary merge duplicate clubs?',
        answer: '',
        toolsUsed: [],
        sources: {},
        escalation,
      })
    ).toMatchObject({
      kind: 'escalate',
      reason: 'low_confidence',
      message: escalation.message,
    });
  });

  it('routes bundled-guide answers with a useful deep link', () => {
    const route = routeSupportDeflection({
      question: 'Where do I see my armband number?',
      answer: 'Open My Entries to see your armband number.',
      toolsUsed: [],
      sources: {},
    });

    expect(route).toMatchObject({
      kind: 'answer',
      deepLink: { label: 'My Entries', href: '/exhibitor/entries' },
    });
  });

  it('escalates empty answers', () => {
    expect(
      routeSupportDeflection({
        question: 'How do I do a thing not in the guides?',
        answer: '',
        toolsUsed: [],
        sources: {},
      })
    ).toMatchObject({ kind: 'escalate', reason: 'low_confidence' });
  });

  it('keeps the client payment hint aligned with the server support-mode gate', () => {
    expect(SUPPORT_PAYMENT_REFUND_PATTERN_SOURCE).toBe(extractServerPatternSource());
  });
});
