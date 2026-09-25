// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { formatTrialLabel as coreFormatTrialLabel } from '../../../packages/core/src/utils/trialLabel';
import { buildTrialLabelMap, formatTrialLabel } from './trialLabel';

// The real stored shape (MYK9-704): the show wizard copies the trial NAME into
// trial_number, so both columns carry the secretary's label.
const saturday = { id: 't2', name: 'Saturday T 2', trial_number: 'Saturday T 2', display_order: 2 };
const friday = { id: 't1', name: 'Friday T 1', trial_number: 'Trial 1', display_order: 1 };

describe('send-confirmation-email trial label (MYK9-713)', () => {
  it.each([
    [{ name: 'Saturday T 2', trialNumber: 'Saturday T 2' }],
    [{ name: 'Friday T 1', trialNumber: 'Trial 1' }],
    [{ name: null, trialNumber: 'Trial 1' }],
    [{ name: '  ', trialNumber: 'II' }],
    [{ name: null, trialNumber: null }],
    [{ name: undefined, trialNumber: '' }],
    [{ name: 'UKC-Nosework', trialNumber: 3 }],
  ])('matches @myk9/core formatTrialLabel for %j', source => {
    expect(formatTrialLabel(source)).toBe(coreFormatTrialLabel(source));
  });

  it('labels each trial by its name, never a prefixed or re-derived numeral', () => {
    const labels = buildTrialLabelMap([saturday, friday]);

    expect(labels.get('t2')).toBe('Saturday T 2');
    expect(labels.get('t1')).toBe('Friday T 1');
  });

  it('falls back to trial_number as-is, then to "Trial", with no Roman numeral', () => {
    const labels = buildTrialLabelMap([
      { id: 'a', name: null, trial_number: 'Trial 1' },
      { id: 'b', name: null, trial_number: null },
    ]);

    expect(labels.get('a')).toBe('Trial 1');
    expect(labels.get('b')).toBe('Trial');
  });
});
