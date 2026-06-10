import { describe, it, expect } from 'vitest';
import { proceedBlockedReason, type ProceedGatingContext } from './proceedGating';

function ctx(overrides: Partial<ProceedGatingContext>): ProceedGatingContext {
  return {
    stepId: 'confirmation',
    selectedDogsCount: 1,
    ownerSelectionOk: true,
    hasSelectedClasses: true,
    hasSeparateHandlerStep: false,
    entryCount: 1,
    unassignedHandlerCount: 0,
    totalFees: 25,
    hasPaymentMethod: true,
    needsAgreement: false,
    agreedToEntryAgreement: false,
    ...overrides,
  };
}

describe('proceedBlockedReason', () => {
  describe('dog-selection', () => {
    it('blocks with no dogs selected', () => {
      expect(proceedBlockedReason(ctx({ stepId: 'dog-selection', selectedDogsCount: 0 }))).toBe(
        'Select at least one dog to continue.'
      );
    });

    it('blocks on owner mismatch', () => {
      expect(
        proceedBlockedReason(
          ctx({ stepId: 'dog-selection', selectedDogsCount: 2, ownerSelectionOk: false })
        )
      ).toMatch(/same owner/);
    });

    it('proceeds with dogs sharing one owner', () => {
      expect(
        proceedBlockedReason(
          ctx({ stepId: 'dog-selection', selectedDogsCount: 2, ownerSelectionOk: true })
        )
      ).toBeNull();
    });
  });

  describe('class-selection', () => {
    it('blocks with no classes selected', () => {
      expect(
        proceedBlockedReason(ctx({ stepId: 'class-selection', hasSelectedClasses: false }))
      ).toBe('Select at least one class to continue.');
    });

    it('blocks when inline handlers are missing (no separate handler step)', () => {
      expect(
        proceedBlockedReason(
          ctx({
            stepId: 'class-selection',
            hasSeparateHandlerStep: false,
            unassignedHandlerCount: 2,
          })
        )
      ).toBe('Assign a handler to each entry to continue (2 remaining).');
    });

    it('ignores handler assignment when a separate handler step exists', () => {
      expect(
        proceedBlockedReason(
          ctx({
            stepId: 'class-selection',
            hasSeparateHandlerStep: true,
            unassignedHandlerCount: 3,
          })
        )
      ).toBeNull();
    });
  });

  describe('handler-assignment', () => {
    it('blocks with zero entries', () => {
      expect(proceedBlockedReason(ctx({ stepId: 'handler-assignment', entryCount: 0 }))).toBe(
        'Select at least one class to continue.'
      );
    });

    it('uses singular copy for one unassigned handler', () => {
      expect(
        proceedBlockedReason(ctx({ stepId: 'handler-assignment', unassignedHandlerCount: 1 }))
      ).toBe('Assign a handler to the remaining entry to continue.');
    });

    it('proceeds when every entry has a handler', () => {
      expect(
        proceedBlockedReason(ctx({ stepId: 'handler-assignment', unassignedHandlerCount: 0 }))
      ).toBeNull();
    });
  });

  describe('payment', () => {
    it('blocks when fees are due and no method is chosen', () => {
      expect(
        proceedBlockedReason(ctx({ stepId: 'payment', totalFees: 25, hasPaymentMethod: false }))
      ).toBe('Choose a payment method to continue.');
    });

    it('skips payment method for $0 totals', () => {
      expect(
        proceedBlockedReason(ctx({ stepId: 'payment', totalFees: 0, hasPaymentMethod: false }))
      ).toBeNull();
    });

    it('blocks until the entry agreement is accepted', () => {
      expect(
        proceedBlockedReason(
          ctx({ stepId: 'payment', needsAgreement: true, agreedToEntryAgreement: false })
        )
      ).toMatch(/entry agreement/);
    });

    it('proceeds with method chosen and agreement accepted', () => {
      expect(
        proceedBlockedReason(
          ctx({ stepId: 'payment', needsAgreement: true, agreedToEntryAgreement: true })
        )
      ).toBeNull();
    });
  });

  it('confirmation always proceeds', () => {
    expect(proceedBlockedReason(ctx({ stepId: 'confirmation' }))).toBeNull();
  });

  it('unknown steps stay blocked (parity with the old default:false)', () => {
    expect(proceedBlockedReason(ctx({ stepId: 'mystery-step' }))).not.toBeNull();
  });
});
