import { describe, expect, it } from 'vitest';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import { toExistingScore } from './toExistingScore';

// MYK9-1011: reopening a saved DQ ("Correct this score") must show DQ with its
// reason, not a blank form and not Excused.
describe('toExistingScore for a disqualified entry', () => {
  it('restores the DQ code and the saved reason', () => {
    const score = toExistingScore({
      id: 'e1',
      result_status: 'disqualified',
      disqualification_reason: 'Attacked a person in the search area',
    } as ReplicatedEntry);
    expect(score?.resultText).toBe('DQ');
    expect(score?.nonQualifyingReason).toBe('Attacked a person in the search area');
  });

  it('keeps Excused on its own code', () => {
    expect(
      toExistingScore({ id: 'e2', result_status: 'excused' } as ReplicatedEntry)?.resultText
    ).toBe('EX');
  });
});
