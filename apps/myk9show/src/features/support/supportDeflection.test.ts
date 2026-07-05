import {
  isSupportPaymentOrRefundQuestion,
  routeSupportDeflection,
  type SupportEscalationEvent,
} from './supportDeflection';

describe('support deflection routing', () => {
  it('escalates payment and refund questions even if an answer was streamed', () => {
    const route = routeSupportDeflection({
      question: 'Can you refund the card I paid with?',
      answer: 'Open My Entries and click...',
      toolsUsed: ['search_user_guide'],
      sources: { guide: [{ title: 'Entries', content: 'My Entries' }] },
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

  it('routes grounded guide answers with a useful deep link', () => {
    const route = routeSupportDeflection({
      question: 'Where do I see my armband number?',
      answer: 'Open My Entries to see your armband number.',
      toolsUsed: ['search_user_guide'],
      sources: {
        guide: [
          {
            title: 'Finding armband numbers',
            content: 'Use My Entries for armband numbers.',
          },
        ],
      },
    });

    expect(route).toMatchObject({
      kind: 'answer',
      deepLink: { label: 'My Entries', href: '/exhibitor/entries' },
    });
  });

  it('escalates ungrounded answers', () => {
    expect(
      routeSupportDeflection({
        question: 'How do I do a thing not in the guides?',
        answer: 'Try this unsupported workaround.',
        toolsUsed: [],
        sources: {},
      })
    ).toMatchObject({ kind: 'escalate', reason: 'low_confidence' });
  });
});
