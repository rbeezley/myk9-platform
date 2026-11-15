import { describe, expect, it } from 'vitest';
import type { PendingMutation } from '@myk9/replication';
import { collectUnsentScores, scoresNotSentLabel } from '../scoresNotSentModel';
import { describeRefusal } from '../scoresNotSentReason';
import { describeUnsentScore } from '../scoresNotSentScore';

function score(overrides: Partial<PendingMutation> = {}): PendingMutation {
  return {
    id: overrides.id ?? 'm1',
    tableName: 'entries',
    operation: 'UPDATE',
    rowId: 'e1',
    data: {},
    timestamp: 1,
    retries: 0,
    status: 'pending',
    rpc: {
      name: 'ringside_update_entry',
      fields: { is_scored: true, result_status: 'qualified', search_time_seconds: 4.35 },
    },
    ...overrides,
  } as PendingMutation;
}

const refused = (overrides: Partial<PendingMutation> = {}) =>
  score({
    status: 'failed',
    failureKind: 'permanent',
    error: 'Non-retryable error: This class is cancelled. Scores and check-ins are closed.',
    ...overrides,
  });

describe('collectUnsentScores (MYK9-2011)', () => {
  it('counts a waiting score and a refused score, one row per dog', () => {
    const rows = collectUnsentScores(
      [score({ id: 'a', rowId: 'e1' }), score({ id: 'b', rowId: 'e1', timestamp: 2 })],
      [refused({ id: 'c', rowId: 'e2', timestamp: 3 })]
    );
    expect(rows.map(row => [row.entryId, row.state])).toEqual([
      ['e2', 'refused'],
      ['e1', 'waiting'],
    ]);
    expect(rows[0]).toMatchObject({ failedMutationIds: ['c'] });
    expect(rows[1]).toMatchObject({ failedMutationIds: [], refusal: undefined });
  });

  it('lists four refusals, all of them', () => {
    const failed = ['e1', 'e2', 'e3', 'e4'].map((rowId, i) =>
      refused({ id: `f${i}`, rowId, timestamp: i })
    );
    expect(collectUnsentScores([], failed).map(row => row.entryId)).toEqual([
      'e4',
      'e3',
      'e2',
      'e1',
    ]);
  });

  it('ignores check-ins, resets and other tables', () => {
    const rows = collectUnsentScores(
      [
        score({
          id: 'checkin',
          rpc: { name: 'ringside_update_entry', fields: { is_in_ring: true } },
        }),
        score({
          id: 'reset',
          rpc: { name: 'ringside_update_entry', fields: { is_scored: false } },
        }),
        score({ id: 'show', tableName: 'shows' }),
      ],
      [refused({ id: 'class', tableName: 'classes' })]
    );
    expect(rows).toEqual([]);
  });

  it('shows the newest score, and is waiting again once a newer score is queued', () => {
    const [row] = collectUnsentScores(
      [
        score({
          id: 'new',
          timestamp: 5,
          rpc: { name: 'ringside_update_entry', fields: { is_scored: true, result_status: 'nq' } },
        }),
      ],
      [refused({ id: 'old', timestamp: 1 })]
    );
    expect(row).toMatchObject({ state: 'waiting', failedMutationIds: ['old'] });
    expect(row?.fields.result_status).toBe('nq');
  });

  it('says the count in scores', () => {
    expect(scoresNotSentLabel(1)).toBe('1 score not sent yet');
    expect(scoresNotSentLabel(3)).toBe('3 scores not sent yet');
  });
});

describe('describeRefusal (MYK9-2011)', () => {
  it.each([
    [
      'Non-retryable error: This class is cancelled. Scores and check-ins are closed.',
      'This class was cancelled.',
    ],
    [
      'Non-retryable error: This class is judged by Lee Okafor',
      'This class is now judged by Lee Okafor.',
    ],
    ['This class has no judge assigned', 'This class has no judge assigned. Ask the secretary.'],
    [
      'Non-retryable error: This class has been deleted, so it can no longer take entries.',
      'This class was deleted.',
    ],
    [
      'Non-retryable error: A Qualified needs a time. Add the time, or change the result to NQ.',
      'A Qualified needs a time. Score the dog again.',
    ],
    [
      'Non-retryable error: 3:40 is over the 3:00 limit. Fix the time, or change the result to NQ.',
      'The time is over the class limit. Score the dog again.',
    ],
  ])('%s', (error, said) => {
    expect(describeRefusal({ error, failureKind: 'permanent' })).toBe(said);
  });

  it('never shows the server text it does not know', () => {
    const raw =
      'Non-retryable error: duplicate key value violates unique constraint "entries_pkey"';
    const said = describeRefusal({ error: raw, failureKind: 'permanent' });
    expect(said).toBe('myK9Show did not accept this score. Ask the secretary.');
    expect(said).not.toMatch(/duplicate|constraint|entries_pkey/);
    expect(
      describeRefusal({ error: 'Not authorized to update entry e1', failureKind: 'authorization' })
    ).toBe('This code cannot score this class. Ask the secretary.');
    expect(
      describeRefusal({ error: 'Max retries exceeded: odd', failureKind: 'max-retries' })
    ).toBe('It did not go through after several tries.');
  });
});

describe('describeUnsentScore (MYK9-2011)', () => {
  it('shows the result, time, faults and reason', () => {
    expect(
      describeUnsentScore({
        result_status: 'qualified',
        search_time_seconds: 4.35,
        total_faults: 0,
      })
    ).toEqual(['Qualified', '0:04.35', '0 faults']);
    expect(
      describeUnsentScore({
        result_status: 'nq',
        search_time_seconds: 0,
        total_faults: 1,
        disqualification_reason: 'Incorrect Call',
      })
    ).toEqual(['NQ', '1 fault', 'Incorrect Call']);
    expect(describeUnsentScore({ result_status: 'absent' })).toEqual(['Absent']);
  });
});
