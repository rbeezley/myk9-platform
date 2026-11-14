import { describe, expect, it } from 'vitest';
import { entryConflictCopy } from './entryConflictCopy';

const dog = { armband_number: '12', dog_call_name: 'Rex' };

describe('entryConflictCopy (MYK9-2010)', () => {
  it('names the dog and shows both scores on the notice and on both buttons', () => {
    const copy = entryConflictCopy(
      { ...dog, is_scored: true, result_status: 'qualified', search_time_seconds: 61.23 },
      { ...dog, is_scored: true, result_status: 'nq', total_faults: 1 }
    );
    expect(copy.title).toBe('#12 Rex was scored two ways');
    expect(copy.description).toContain('This device: Qualified, 1:01.23.');
    expect(copy.description).toContain('Other device: NQ, 1 fault.');
    expect(copy.takeRemoteLabel).toBe('Keep the other score: NQ, 1 fault');
    expect(copy.keepLocalLabel).toBe('Keep my score: Qualified, 1:01.23');
  });

  it('says so when one side has no score, and falls back when the dog is unknown', () => {
    const copy = entryConflictCopy({ is_scored: true, result_status: 'qualified' }, {});
    expect(copy.title).toBe('A dog was scored two ways');
    expect(copy.takeRemoteLabel).toBe('Keep the other score: no score yet');
  });

  it('names the dog on a conflict that involves no score', () => {
    const copy = entryConflictCopy({ ...dog }, { ...dog });
    expect(copy.title).toBe('#12 Rex was changed somewhere else at the same time');
  });

  it('shows both statuses when two staff changed an unscored dog', () => {
    const copy = entryConflictCopy(
      { ...dog, check_in_status: 'at-gate' },
      { ...dog, check_in_status: 'pulled' }
    );
    expect(copy.title).toBe('#12 Rex was checked in two ways');
    expect(copy.takeRemoteLabel).toMatch(/^Keep the other status: .*[Pp]ulled/);
    expect(copy.keepLocalLabel).toMatch(/^Keep my status: /);
    expect(copy.description).toContain('drops anything else');
  });
});
