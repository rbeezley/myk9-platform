import { describe, expect, it } from 'vitest';
import { isUnsetJudgeName } from '@/utils/classJudgeDisplay';
import { toTrialDetailClass } from '../trialDetailClassProjection';

describe('toTrialDetailClass judge name', () => {
  it('projects a class with no judge as unset text, not the literal TBD', () => {
    const projected = toTrialDetailClass(
      { id: 'c1', judge: '', status: 'Scheduled' } as Parameters<typeof toTrialDetailClass>[0],
      0
    );

    expect(projected.judgeName).toBe('');
    expect(isUnsetJudgeName(projected.judgeName)).toBe(true);
  });

  it('keeps a real judge name', () => {
    const projected = toTrialDetailClass(
      { id: 'c1', judge: 'Pat Judge', status: 'Scheduled' } as Parameters<
        typeof toTrialDetailClass
      >[0],
      0
    );

    expect(projected.judgeName).toBe('Pat Judge');
  });
});
