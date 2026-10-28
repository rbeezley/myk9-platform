import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import {
  discardSupersededPicks,
  invalidatesClassEnrichment,
  judgeFieldsAfterPick,
} from './classJudgePick';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const old = {
  judgeId: 'judge-old',
  judgeName: 'Old Judge',
  judgeFirstName: 'Old',
  judgeLastName: 'Judge',
};

describe('judgeFieldsAfterPick (MYK9-1327)', () => {
  it('puts the picked judge and its name on the row', () => {
    expect(
      judgeFieldsAfterPick(old, {
        personId: 'judge-1',
        name: 'Jane Judge',
        firstName: 'Jane',
        lastName: 'Judge',
      })
    ).toEqual({
      judgeId: 'judge-1',
      judgeName: 'Jane Judge',
      judgeFirstName: 'Jane',
      judgeLastName: 'Judge',
      judgeResolved: true,
    });
  });

  it("never leaves the previous judge's name beside a new judge when no name is given", () => {
    const fields = judgeFieldsAfterPick(old, { personId: 'judge-1' });
    expect(fields).toMatchObject({ judgeId: 'judge-1', judgeResolved: true });
    expect(fields.judgeName).toBeUndefined();
    expect(fields.judgeFirstName).toBeUndefined();
    expect(fields.judgeLastName).toBeUndefined();
  });

  it("keeps the row's name when no name is given and the row already names that judge", () => {
    expect(judgeFieldsAfterPick(old, { personId: 'judge-old' })).toMatchObject({
      judgeId: 'judge-old',
      judgeName: 'Old Judge',
      judgeFirstName: 'Old',
      judgeLastName: 'Judge',
    });
  });

  it('clears every judge field on a removal, with explicit undefined so a spread overwrites', () => {
    const fields = judgeFieldsAfterPick(old, null);
    expect(fields).toEqual({
      judgeId: undefined,
      judgeName: undefined,
      judgeFirstName: undefined,
      judgeLastName: undefined,
      judgeResolved: true,
    });
    expect(Object.keys(fields).sort()).toEqual(
      ['judgeFirstName', 'judgeId', 'judgeLastName', 'judgeName', 'judgeResolved'].sort()
    );
  });
});

describe('invalidatesClassEnrichment (MYK9-1327)', () => {
  const upload = (mutations?: Array<{ rpcName?: string }>) => ({
    tables: ['classes'],
    count: 1,
    ...(mutations && {
      mutations: mutations.map(m => ({
        tableName: 'classes',
        rowId: 'class-1',
        operation: 'UPDATE' as const,
        ...m,
      })),
    }),
  });

  it('is true when the batch carried a set_class_judge', () => {
    expect(invalidatesClassEnrichment(upload([{}, { rpcName: 'set_class_judge' }]))).toBe(true);
  });

  it('is false for other RPCs, plain writes, and producers that send no mutation list', () => {
    expect(invalidatesClassEnrichment(upload([{ rpcName: 'ringside_update_class' }, {}]))).toBe(
      false
    );
    expect(invalidatesClassEnrichment(upload())).toBe(false);
  });
});

describe('discardSupersededPicks (MYK9-1327)', () => {
  it('tries every id and does not throw when one discard fails', async () => {
    const discardFailedMutation = vi.fn(async (id: string) => {
      if (id === 'm1') throw new Error('queue busy');
    });
    const queue = {
      discardFailedMutation,
      getPendingMutationsForRow: vi.fn(),
      getFailedMutations: vi.fn(),
    };

    await expect(discardSupersededPicks(queue, ['m1', 'm2'])).resolves.toBeUndefined();

    expect(discardFailedMutation.mock.calls.map(call => call[0])).toEqual(['m1', 'm2']);
  });
});
