import { describe, it, expect } from 'vitest';
import { juniorFeeMayApply } from './juniorFeePolicy';

const show = { organization: 'AKC', juniorHandlerFee: '15', juniorFeeKnown: true };

describe('juniorFeeMayApply', () => {
  it('applies to a desk entry on a show with a positive junior fee', () => {
    expect(juniorFeeMayApply(show, 'secretary', 'secretary_paid')).toBe(true);
  });

  it.each(['', '0', undefined])('does not apply when the known fee is %j', fee => {
    expect(
      juniorFeeMayApply({ ...show, juniorHandlerFee: fee }, 'secretary', 'secretary_paid')
    ).toBe(false);
  });

  it('applies while the device cannot tell whether the show has a junior fee', () => {
    const unsynced = { organization: 'AKC', juniorHandlerFee: undefined, juniorFeeKnown: false };
    expect(juniorFeeMayApply(unsynced, 'secretary', 'secretary_paid')).toBe(true);
  });

  it('never applies to ASCA, known or unknown, so the UI and submit agree', () => {
    expect(
      juniorFeeMayApply({ ...show, organization: 'ASCA' }, 'secretary', 'secretary_paid')
    ).toBe(false);
    expect(
      juniorFeeMayApply(
        { organization: 'ASCA', juniorHandlerFee: undefined, juniorFeeKnown: false },
        'secretary',
        'secretary_paid'
      )
    ).toBe(false);
  });

  it('never applies to exhibitors or waived entries', () => {
    expect(juniorFeeMayApply(show, 'exhibitor', 'credit_card')).toBe(false);
    expect(juniorFeeMayApply(show, 'secretary', 'waived')).toBe(false);
  });
});
