import { describe, expect, it } from 'vitest';

import { buildShowSummary, premiumTemplateTrialType } from './showSummary.ts';

const classes = [{ name: 'Novice', level: 'Novice', element: 'Containers' }];
const show = {
  name: 'Fall Specialty',
  trials: [
    {
      name: 'Cancelled Trial',
      date: '2027-03-01',
      trial_type: 'Obedience',
      status: 'cancelled',
      deleted_at: null,
      classes,
    },
    {
      name: 'Deleted Trial',
      date: '2027-03-02',
      trial_type: 'Rally',
      status: 'upcoming',
      deleted_at: '2026-11-01T00:00:00Z',
      classes,
    },
    {
      name: 'Live Trial',
      date: '2027-03-03',
      trial_type: 'Scent Work',
      status: 'upcoming',
      deleted_at: null,
      classes,
    },
  ],
};

describe('Regenerate trial inputs (MYK9-2186)', () => {
  it('leaves a cancelled or deleted trial out of the narrative input', () => {
    const summary = buildShowSummary(show);
    expect(summary).toContain('Live Trial');
    expect(summary).not.toContain('Cancelled Trial');
    expect(summary).not.toContain('Deleted Trial');
  });

  it('picks the template from the first live trial, not the first trial', () => {
    expect(premiumTemplateTrialType(show.trials)).toBe('Scent Work');
  });

  it('reads no live trial as no trial type', () => {
    expect(premiumTemplateTrialType(show.trials.slice(0, 2))).toBeNull();
    expect(premiumTemplateTrialType(null)).toBeNull();
  });
});
