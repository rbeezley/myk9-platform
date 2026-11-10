import { describe, expect, it } from 'vitest';
import type { SyncableClassData } from '@/store/class-store-types';
import { toTrialDetailClass } from './trialDetailClassProjection';

const base = { id: 'c1', status: 'Scheduled', trialDate: '2026-10-10' } as SyncableClassData;

describe('toTrialDetailClass judge name (MYK9-1846)', () => {
  it('says the judge is to be announced when none is set', () => {
    expect(toTrialDetailClass({ ...base, judge: '' }, 0).judgeName).toBe('Judge to be announced');
  });

  it('reads an old local TBD row the same way', () => {
    expect(toTrialDetailClass({ ...base, judge: 'TBD' }, 0).judgeName).toBe(
      'Judge to be announced'
    );
  });

  it('keeps a real judge name', () => {
    expect(toTrialDetailClass({ ...base, judge: 'Jane Smith' }, 0).judgeName).toBe('Jane Smith');
  });
});
