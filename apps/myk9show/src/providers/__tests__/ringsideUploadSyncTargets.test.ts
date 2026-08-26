import { describe, expect, it, vi } from 'vitest';
import type { UploadCompleteEventDetail } from '@myk9/replication';
import { getRingsideUploadSyncTargets } from '../ringsideUploadSyncTargets';

function event(ids = ['entry-1']): UploadCompleteEventDetail {
  return {
    tables: ['entries'],
    count: ids.length,
    mutations: ids.map(rowId => ({
      tableName: 'entries',
      rowId,
      operation: 'UPDATE',
      rpcName: 'ringside_update_entry',
    })),
  };
}
function reader() {
  return {
    getEntry: vi.fn(async () => ({ showId: 'show-1', classId: 'class-1' })),
    getClass: vi.fn(async () => ({ trialId: 'trial-1' })),
  };
}

describe('ringside upload refresh scopes', () => {
  it('deduplicates rows and scopes without a network read', async () => {
    const local = reader();
    await expect(
      getRingsideUploadSyncTargets(event(['entry-1', 'entry-1', 'entry-2']), local)
    ).resolves.toEqual([
      { name: 'entries', scopeId: 'show-1' },
      { name: 'classes', scopeId: 'trial-1' },
    ]);
    expect(local.getEntry).toHaveBeenCalledTimes(2);
  });
  it('keeps separate shows and trials in an offline backlog', async () => {
    const local = reader();
    local.getEntry.mockResolvedValueOnce({ showId: 'show-2', classId: 'class-2' });
    local.getClass.mockResolvedValueOnce({ trialId: 'trial-2' });
    await expect(
      getRingsideUploadSyncTargets(event(['entry-2', 'entry-1']), local)
    ).resolves.toEqual([
      { name: 'entries', scopeId: 'show-2' },
      { name: 'classes', scopeId: 'trial-2' },
      { name: 'entries', scopeId: 'show-1' },
      { name: 'classes', scopeId: 'trial-1' },
    ]);
  });
  it.each([
    { tables: ['entries'], count: 1 },
    { ...event(), count: 2 },
    { ...event(), mutations: [] },
    { ...event(), tables: ['entries', 'dogs'] },
    { ...event(), mutations: [{ tableName: 'entries', rowId: 'e', operation: 'UPDATE' as const }] },
    {
      ...event(),
      mutations: [
        {
          tableName: 'entries',
          rowId: 'e',
          operation: 'DELETE' as const,
          rpcName: 'ringside_update_entry',
        },
      ],
    },
  ])('retains full refresh for incomplete, legacy or non-ringside batches: %j', async detail => {
    const local = reader();
    await expect(getRingsideUploadSyncTargets(detail, local)).resolves.toBeNull();
    expect(local.getEntry).not.toHaveBeenCalled();
  });
  it('falls back if local entry/class scope is missing or IDB fails', async () => {
    await expect(
      getRingsideUploadSyncTargets(event(), { ...reader(), getEntry: async () => null })
    ).resolves.toBeNull();
    await expect(
      getRingsideUploadSyncTargets(event(), { ...reader(), getClass: async () => null })
    ).resolves.toBeNull();
    await expect(
      getRingsideUploadSyncTargets(event(), {
        ...reader(),
        getEntry: async () => {
          throw new Error('IDB unavailable');
        },
      })
    ).resolves.toBeNull();
  });
});
