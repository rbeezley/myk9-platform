import { describe, expect, it } from 'vitest';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import { toExistingScore } from './toExistingScore';

// MYK9-2068: Area 5 and the UKC element time come back on "Correct this score".
describe('toExistingScore extra times', () => {
  it('restores the fifth area time and the element time', () => {
    const score = toExistingScore({
      id: 'e1',
      result_status: 'qualified',
      search_time_seconds: 150,
      area1_time_seconds: 10,
      area2_time_seconds: 20,
      area3_time_seconds: 30,
      area4_time_seconds: 40,
      area5_time_seconds: 50,
      element_time_seconds: 185.5,
    } as ReplicatedEntry);
    expect(score?.areaTimes).toEqual(['0:10.00', '0:20.00', '0:30.00', '0:40.00', '0:50.00']);
    expect(score?.element).toBe('3:05.50');
  });

  it('leaves the element time off a row that has none', () => {
    const score = toExistingScore({
      id: 'e2',
      result_status: 'qualified',
      search_time_seconds: 60,
    } as ReplicatedEntry);
    expect(score).not.toHaveProperty('element');
  });
});
