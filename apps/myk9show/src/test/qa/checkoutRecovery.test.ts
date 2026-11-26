import { describe, expect, it } from 'vitest';
import {
  decideAfterSilence,
  LINK_PROMPT_PATTERN,
  PROCESSING_PATTERN,
  type CheckoutPageState,
  type StripeSessionStatus,
} from '../e2e/secretary/checkoutRecovery';

const open: StripeSessionStatus = { status: 'open', payment_status: 'unpaid' };
const paid: StripeSessionStatus = { status: 'complete', payment_status: 'paid' };
const idle: CheckoutPageState = { kind: 'idle' };

describe('decideAfterSilence', () => {
  it('retries the click once only when the page is idle and the session is open and unpaid', () => {
    expect(decideAfterSilence(idle, open).action).toBe('retry');
  });

  it.each<CheckoutPageState>([
    idle,
    { kind: 'processing' },
    { kind: 'validation-error', message: 'Your card was declined.' },
    { kind: 'link-prompt' },
  ])('never clicks again once Stripe says the session is paid (page $kind)', page => {
    expect(decideAfterSilence(page, paid).action).toBe('wait');
  });

  it('treats a complete session as paid even if payment_status lags', () => {
    expect(decideAfterSilence(idle, { status: 'complete', payment_status: 'unpaid' }).action).toBe(
      'wait'
    );
  });

  it('never clicks when the session could not be read', () => {
    expect(decideAfterSilence(idle, null).action).toBe('fail');
  });

  it('fails on an expired session', () => {
    expect(decideAfterSilence(idle, { status: 'expired', payment_status: 'unpaid' }).action).toBe(
      'fail'
    );
  });

  it('waits while Checkout is processing and the session is still open', () => {
    expect(decideAfterSilence({ kind: 'processing' }, open).action).toBe('wait');
  });

  it('reports the validation message and does not retry', () => {
    const decision = decideAfterSilence(
      { kind: 'validation-error', message: 'Your card number is incomplete.' },
      open
    );
    expect(decision).toEqual({
      action: 'fail',
      reason: 'Stripe Checkout showed an error: Your card number is incomplete.',
    });
  });

  it('reports Link taking over and does not retry', () => {
    const decision = decideAfterSilence({ kind: 'link-prompt' }, open);
    expect(decision.action).toBe('fail');
    expect(decision.reason).toMatch(/Link/);
  });
});

describe('page text patterns', () => {
  it('recognises Link code prompts and processing text', () => {
    expect(LINK_PROMPT_PATTERN.test('Enter your code')).toBe(true);
    expect(LINK_PROMPT_PATTERN.test('Enter the 6-digit code we sent')).toBe(true);
    expect(LINK_PROMPT_PATTERN.test('Pay with card')).toBe(false);
    expect(PROCESSING_PATTERN.test('Processing…')).toBe(true);
    expect(PROCESSING_PATTERN.test('Pay $25.00')).toBe(false);
  });
});
