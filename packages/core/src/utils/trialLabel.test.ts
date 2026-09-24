import { describe, expect, it } from 'vitest';
import { formatTrialLabel, TRIAL_LABEL_FALLBACK } from './trialLabel';

describe('formatTrialLabel', () => {
  it('uses the stored name as-is, without a "Trial " prefix', () => {
    expect(formatTrialLabel({ name: 'Saturday T 2', trialNumber: 'Saturday T 2' })).toBe(
      'Saturday T 2'
    );
    expect(formatTrialLabel({ name: 'Trial 1', trialNumber: 'Trial 1' })).toBe('Trial 1');
  });

  it('prefers name over a differing trial_number', () => {
    expect(formatTrialLabel({ name: 'UKC Nosework Trial', trialNumber: 'UKC-Nosework' })).toBe(
      'UKC Nosework Trial'
    );
  });

  it('falls back to trial_number as-is when name is absent', () => {
    expect(formatTrialLabel({ trialNumber: 'Saturday Trial 1' })).toBe('Saturday Trial 1');
    expect(formatTrialLabel({ name: null, trialNumber: '2' })).toBe('2');
    expect(formatTrialLabel({ name: '', trialNumber: 3 })).toBe('3');
  });

  it('falls back to the literal "Trial" when neither is present', () => {
    expect(formatTrialLabel({})).toBe(TRIAL_LABEL_FALLBACK);
    expect(formatTrialLabel({ name: '   ', trialNumber: '' })).toBe('Trial');
    expect(formatTrialLabel({ name: undefined, trialNumber: null })).toBe('Trial');
  });

  it('never parses or strips the stored value', () => {
    expect(formatTrialLabel({ name: ' Sat AM ' })).toBe(' Sat AM ');
    expect(formatTrialLabel({ name: 'TRIAL trial' })).toBe('TRIAL trial');
  });
});
