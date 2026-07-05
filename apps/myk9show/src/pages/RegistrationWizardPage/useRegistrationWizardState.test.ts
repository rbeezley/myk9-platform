import { describe, expect, it } from 'vitest';
import { defaultPaymentForMode } from './useRegistrationWizardState';

describe('defaultPaymentForMode', () => {
  it('keeps exhibitors on online checkout by default', () => {
    expect(defaultPaymentForMode('exhibitor')).toBe('credit_card');
  });

  it('defaults secretary mail-in mode to recording payment already received', () => {
    expect(defaultPaymentForMode('secretary_new')).toBe('secretary_paid');
  });

  it('leaves non-secretary staff modes explicit', () => {
    expect(defaultPaymentForMode('club_admin')).toBeUndefined();
    expect(defaultPaymentForMode('site_admin')).toBeUndefined();
  });
});
