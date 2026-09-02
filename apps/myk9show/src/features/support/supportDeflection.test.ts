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

  it('uses the shared payment/refund classifier for client-side hints', () => {
    expect(isSupportPaymentOrRefundQuestion('Stripe checkout charged me twice')).toBe(true);
    expect(isSupportPaymentOrRefundQuestion('Where do I find my armband?')).toBe(false);
  });

  it('routes announcement answers to a resolvable surface', () => {
    const route = routeSupportDeflection({
      question: 'Where can I see announcements?',
      answer: 'Open Messages to see announcements from the show team.',
      toolsUsed: [],
      sources: {},
      showId: 'show-1',
    });

    expect(route).toMatchObject({
      kind: 'answer',
      deepLink: { label: 'Messages', href: '/messages/show-1' },
    });
  });

  it('omits the show-specific messages link without show context', () => {
    const route = routeSupportDeflection({
      question: 'Where can I see announcements?',
      answer: 'Open Messages to see announcements from the show team.',
      toolsUsed: [],
      sources: {},
    });

    expect(route).toMatchObject({ kind: 'answer', deepLink: null });
  });
});
