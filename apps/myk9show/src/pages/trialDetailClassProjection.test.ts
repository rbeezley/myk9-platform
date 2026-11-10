import { describe, expect, it } from 'vitest';
import { toTrialDetailClass } from './trialDetailClassProjection';

const base = { id: 'c1', element: 'Interior', level: 'Novice', section: 'A', status: 'Scheduled' };

describe('toTrialDetailClass judge name (MYK9-1846)', () => {
  it('says the judge is to be announced for an unset or legacy TBD judge', () => {
    for (const judge of ['', undefined, 'TBD']) {
      expect(toTrialDetailClass({ ...base, judge } as never, 0).judgeName).toBe(
        'Judge to be announced'
      );
    }
  });

  it('keeps a real judge name', () => {
    expect(toTrialDetailClass({ ...base, judge: 'Jane Smith' } as never, 0).judgeName).toBe(
      'Jane Smith'
    );
  });
});
