import { describe, expect, it } from 'vitest';
import {
  defaultPaymentForMode,
  shouldEnableRegistrationCapacityCheck,
} from './useRegistrationWizardState';
import { isShowDeskLateEntryMode } from '../RegistrationWizardPage.routes';

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

describe('shouldEnableRegistrationCapacityCheck', () => {
  it('keeps the capacity check enabled for exhibitors despite a late-entry URL hint', () => {
    const isLateEntryMode = isShowDeskLateEntryMode(
      new URLSearchParams('source=show-desk&entryMode=late')
    );

    expect(shouldEnableRegistrationCapacityCheck('exhibitor', isLateEntryMode)).toBe(true);
  });

  it('preserves the capacity-check bypass for organizer late entry', () => {
    expect(shouldEnableRegistrationCapacityCheck('secretary_new', true)).toBe(false);
  });

  it('keeps the existing bypass for ordinary organizer workflows', () => {
    expect(shouldEnableRegistrationCapacityCheck('secretary_new', false)).toBe(false);
  });
});
