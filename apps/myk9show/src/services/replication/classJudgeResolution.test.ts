/**
 * MYK9-494 review follow-ups — the two ways the judge name could still be wrong after the
 * original fix, both of which the first round of tests could not see because they hydrate once.
 *
 *  * P1: the `get_show_judges` enrichment is best-effort and its failure is swallowed. On an
 *    incremental sync triggered by anything at all, `rowToClass` would then yield
 *    `judgeName: undefined` and `resolveConflict` would commit that over a correct cached
 *    name — back to `Judge TBD`, silently.
 *  * P3: with two confirmed assignments on one class, the person id came from the embed and the
 *    name from an unordered RPC result, so they could belong to different judges.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/services/database/supabaseClient', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/database/supabaseClient')>();
  return {
    ...actual,
    supabase: {
      rpc: (...args: unknown[]) => mockRpc(...args),
      from: (...args: unknown[]) => mockFrom(...args),
    },
  };
});

import type { ReplicatedClass } from './ReplicatedClassesTable';

const { ReplicatedClassesTable, rowToClass } = await import('./ReplicatedClassesTable');
const { resolveJudgeNamesForClassRows } = await import('./resolveClassJudgeNames');
const { fetchShowJudgeNameParts } = await import('@/services/database/_shared/judgeNamesByClass');

class TestableClassesTable extends ReplicatedClassesTable {
  publicResolveConflict(local: ReplicatedClass, remote: ReplicatedClass): ReplicatedClass {
    return this.resolveConflict(local, remote);
  }
}

const SHOW_ID = 'show-1';
const TRIAL_ID = 'trial-1';
const CLASS_ID = 'class-1';
const JUDGE_ID = 'person-judge';

const CLASS_ROW = {
  id: CLASS_ID,
  trial_id: TRIAL_ID,
  name: 'Interior Advanced',
  status: 'scheduled',
  judge_assignments: [{ id: 'a-1', person_id: JUDGE_ID, status: 'confirmed' }],
};

function stubTrials() {
  mockFrom.mockImplementation(() => {
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'in', 'eq', 'is']) {
      builder[method] = () => builder;
    }
    builder.then = (onFulfilled: unknown, onRejected: unknown) =>
      Promise.resolve({ data: [{ id: TRIAL_ID, show_id: SHOW_ID }], error: null }).then(
        onFulfilled as never,
        onRejected as never
      );
    return builder;
  });
}

/** Runs the sync's enrichment + mapper exactly as ReplicatedClassesTable.fetchRemoteRows does. */
async function syncPass(): Promise<ReplicatedClass> {
  const judgeByClassId = await resolveJudgeNamesForClassRows([CLASS_ROW]);
  return rowToClass({
    ...CLASS_ROW,
    _judge: judgeByClassId.get(CLASS_ID) ?? null,
    _judgeResolved: judgeByClassId.has(CLASS_ID),
  } as never);
}

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
  stubTrials();
});

describe('MYK9-494 P1 — a failed enrichment must not erase a cached judge name', () => {
  it('marks the row unresolved when the RPC fails, and resolved when it succeeds', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          assignment_id: 'a-1',
          person_id: JUDGE_ID,
          first_name: 'Test',
          last_name: 'Judge',
          trial_id: TRIAL_ID,
          class_id: CLASS_ID,
          status: 'confirmed',
        },
      ],
      error: null,
    });
    const good = await syncPass();
    expect(good.judgeName).toBe('Test Judge');
    expect(good.judgeResolved).toBe(true);

    mockRpc.mockResolvedValue({ data: null, error: { message: 'network' } });
    const blind = await syncPass();
    expect(blind.judgeName).toBeUndefined();
    expect(blind.judgeResolved).toBe(false);
    // The assignment itself still arrives, so the id survives — that is what lets the merge
    // below prove the judge did not change.
    expect(blind.judgeId).toBe(JUDGE_ID);
  });

  it('resolveConflict keeps the cached name when the remote row was never enriched', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          assignment_id: 'a-1',
          person_id: JUDGE_ID,
          first_name: 'Test',
          last_name: 'Judge',
          trial_id: TRIAL_ID,
          class_id: CLASS_ID,
          status: 'confirmed',
        },
      ],
      error: null,
    });
    const local = await syncPass();

    mockRpc.mockResolvedValue({ data: null, error: { message: 'network' } });
    const remote = await syncPass();

    const merged = new TestableClassesTable().publicResolveConflict(local, remote);

    expect(merged.judgeName).toBe('Test Judge');
    expect(merged.judgeFirstName).toBe('Test');
    expect(merged.judgeLastName).toBe('Judge');
    expect(merged.judgeId).toBe(JUDGE_ID);
  });

  it('resolveConflict clears the name when the enrichment RAN and found no confirmed judge', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          assignment_id: 'a-1',
          person_id: JUDGE_ID,
          first_name: 'Test',
          last_name: 'Judge',
          trial_id: TRIAL_ID,
          class_id: CLASS_ID,
          status: 'confirmed',
        },
      ],
      error: null,
    });
    const local = await syncPass();

    // The judge declined: the RPC answers, with no confirmed row for this class.
    mockRpc.mockResolvedValue({ data: [], error: null });
    const remote = rowToClass({
      ...CLASS_ROW,
      judge_assignments: [{ id: 'a-1', person_id: JUDGE_ID, status: 'declined' }],
      _judge: null,
      _judgeResolved: true,
    } as never);

    const merged = new TestableClassesTable().publicResolveConflict(local, remote);

    expect(merged.judgeName).toBeUndefined();
    expect(merged.judgeId).toBeUndefined();
  });

  it('resolveConflict does not carry a stale name onto a DIFFERENT judge', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          assignment_id: 'a-1',
          person_id: JUDGE_ID,
          first_name: 'Test',
          last_name: 'Judge',
          trial_id: TRIAL_ID,
          class_id: CLASS_ID,
          status: 'confirmed',
        },
      ],
      error: null,
    });
    const local = await syncPass();

    // Swapped to another judge while the enrichment was unavailable.
    const remote = rowToClass({
      ...CLASS_ROW,
      judge_assignments: [{ id: 'a-2', person_id: 'person-other', status: 'confirmed' }],
      _judge: null,
      _judgeResolved: false,
    } as never);

    const merged = new TestableClassesTable().publicResolveConflict(local, remote);

    expect(merged.judgeId).toBe('person-other');
    expect(merged.judgeName).toBeUndefined();
  });

  it('still preserves the Phase 1h visibility enrichment it always did', () => {
    const table = new TestableClassesTable();
    const merged = table.publicResolveConflict(
      { id: CLASS_ID, name: 'x', selfCheckinEnabled: true, visibilityPreset: 'full' },
      { id: CLASS_ID, name: 'x' }
    );
    expect(merged.selfCheckinEnabled).toBe(true);
    expect(merged.visibilityPreset).toBe('full');
  });
});

describe('MYK9-494 P3 — name and person id come from the same assignment', () => {
  const twoConfirmed = (order: Array<'a-1' | 'a-2'>) =>
    order.map(assignmentId => ({
      assignment_id: assignmentId,
      person_id: assignmentId === 'a-1' ? 'person-first' : 'person-second',
      first_name: assignmentId === 'a-1' ? 'First' : 'Second',
      last_name: 'Judge',
      trial_id: TRIAL_ID,
      class_id: CLASS_ID,
      status: 'confirmed',
    }));

  it.each([
    ['a-1 first', ['a-1', 'a-2'] as Array<'a-1' | 'a-2'>],
    ['a-2 first', ['a-2', 'a-1'] as Array<'a-1' | 'a-2'>],
  ])('picks the lowest assignment id regardless of row order (%s)', async (_label, order) => {
    mockRpc.mockResolvedValue({ data: twoConfirmed(order), error: null });

    const parts = await fetchShowJudgeNameParts(SHOW_ID);

    expect(parts?.get(CLASS_ID)).toEqual({
      personId: 'person-first',
      firstName: 'First',
      lastName: 'Judge',
    });
  });

  it('never pairs one judge’s name with another judge’s id', async () => {
    mockRpc.mockResolvedValue({ data: twoConfirmed(['a-2', 'a-1']), error: null });

    // The embed lists the OTHER assignment first — the old code took the id from here.
    const cls = rowToClass({
      ...CLASS_ROW,
      judge_assignments: [
        { id: 'a-2', person_id: 'person-second', status: 'confirmed' },
        { id: 'a-1', person_id: 'person-first', status: 'confirmed' },
      ],
      _judge: (await resolveJudgeNamesForClassRows([CLASS_ROW])).get(CLASS_ID) ?? null,
      _judgeResolved: true,
    } as never);

    expect(cls.judgeName).toBe('First Judge');
    expect(cls.judgeId).toBe('person-first');
  });

  it('returns null — not an empty map — when the RPC fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(fetchShowJudgeNameParts(SHOW_ID)).resolves.toBeNull();

    mockRpc.mockRejectedValue(new Error('offline'));
    await expect(fetchShowJudgeNameParts(SHOW_ID)).resolves.toBeNull();
  });
});
