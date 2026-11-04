import { describe, expect, it } from 'vitest';
import { resolveJudgesOnDays, type JudgeAssignmentInput } from '../judgesOnDays';

const person = (first: string, last: string) => ({ first_name: first, last_name: last });

function row(
  overrides: Partial<JudgeAssignmentInput> & Pick<JudgeAssignmentInput, 'id' | 'person_id'>
) {
  return {
    status: 'confirmed',
    class_id: null,
    trial_id: null,
    class: null,
    people: person('Judge', overrides.id),
    ...overrides,
  } satisfies JudgeAssignmentInput;
}

const days = ['sat', 'sun'];

describe('resolveJudgesOnDays (real assignment shapes)', () => {
  it('puts a class-scoped judge (trial_id NULL, class.trial_id set) on that class day only', () => {
    const result = resolveJudgesOnDays(days, [
      row({ id: 'A', person_id: 'p-a', class_id: 'c-1', class: { trial_id: 'sun' } }),
    ]);

    expect(result.get('sat')).toEqual([]);
    expect(result.get('sun')?.map(j => j.person_id)).toEqual(['p-a']);
  });

  it('puts a trial-scoped judge on that trial only', () => {
    const result = resolveJudgesOnDays(days, [row({ id: 'B', person_id: 'p-b', trial_id: 'sat' })]);

    expect(result.get('sat')?.map(j => j.person_id)).toEqual(['p-b']);
    expect(result.get('sun')).toEqual([]);
  });

  it('puts a show-wide judge (no class, no trial) on every day', () => {
    const result = resolveJudgesOnDays(days, [row({ id: 'C', person_id: 'p-c' })]);

    expect(result.get('sat')?.map(j => j.person_id)).toEqual(['p-c']);
    expect(result.get('sun')?.map(j => j.person_id)).toEqual(['p-c']);
  });

  it('leaves out declined and cancelled assignments, keeps invited and confirmed', () => {
    const result = resolveJudgesOnDays(days, [
      row({ id: 'D', person_id: 'p-d', status: 'declined' }),
      row({ id: 'E', person_id: 'p-e', status: 'cancelled' }),
      row({ id: 'F', person_id: 'p-f', status: 'invited' }),
      row({ id: 'G', person_id: 'p-g', status: null }),
    ]);

    expect(result.get('sat')?.map(j => j.person_id)).toEqual(['p-f']);
  });

  it('lists a judge once per day across classes, sorted by name, and ignores unknown days', () => {
    const result = resolveJudgesOnDays(days, [
      row({
        id: 'Z',
        person_id: 'p-z',
        class_id: 'c-1',
        class: { trial_id: 'sat' },
        people: person('Zed', 'Last'),
      }),
      row({
        id: 'Z2',
        person_id: 'p-z',
        class_id: 'c-2',
        class: { trial_id: 'sat' },
        people: person('Zed', 'Last'),
      }),
      row({ id: 'Y', person_id: 'p-y', trial_id: 'sat', people: person('Amy', 'First') }),
      row({ id: 'X', person_id: 'p-x', trial_id: 'other-show-day' }),
      row({ id: 'W', person_id: 'p-w', class_id: 'c-9', class: null }),
    ]);

    expect(result.get('sat')?.map(j => j.judge_name)).toEqual(['Amy First', 'Zed Last']);
    expect(result.has('other-show-day')).toBe(false);
  });
});
