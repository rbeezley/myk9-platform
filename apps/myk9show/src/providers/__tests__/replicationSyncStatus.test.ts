import { describe, expect, it } from 'vitest';
import {
  classifyTableSyncResults,
  createTablesStatus,
  getPostSyncInvalidationKeys,
  shouldRequestPostUploadSync,
} from '../replicationSyncStatus';

describe('replicationSyncStatus helpers', () => {
  it('creates a table status map using the requested status', () => {
    expect(createTablesStatus(['shows', 'entries'], 'idle')).toEqual({
      shows: 'idle',
      entries: 'idle',
    });
  });

  it('classifies successes, aborts, failures, and recovered replicas', () => {
    const result = classifyTableSyncResults(
      [
        { name: 'shows', ok: true, recoveredFromEmptyReplica: true },
        { name: 'entries', ok: false, error: 'AbortError: superseded', recoveredFromEmptyReplica: false },
        { name: 'dogs', ok: false, error: 'permission denied', recoveredFromEmptyReplica: false },
        { name: 'classes', ok: false, recoveredFromEmptyReplica: false },
      ],
      error => error?.includes('AbortError') ?? false
    );

    expect(result.tableStatusUpdates).toEqual({
      shows: 'success',
      entries: 'idle',
      dogs: 'error',
      classes: 'error',
    });
    expect(result.downloadFailures).toEqual([
      { name: 'dogs', error: 'permission denied' },
      { name: 'classes', error: 'Unknown error' },
    ]);
    expect(result.recoveredTables).toEqual(['shows']);
    expect(result.abortedTables).toEqual([{ name: 'entries', error: 'AbortError: superseded' }]);
  });

  it('returns replicated table query keys plus the judge assignment join key', () => {
    expect(getPostSyncInvalidationKeys(['shows', 'entries'])).toEqual([
      ['shows'],
      ['entries'],
      ['judges', 'assignments'],
    ]);
  });

  it('requests a follow-up download sync after replicated table uploads', () => {
    expect(shouldRequestPostUploadSync(['entries'], ['shows', 'entries', 'armbands'], false)).toBe(
      true
    );
    expect(
      shouldRequestPostUploadSync(['entry_carts'], ['shows', 'entries', 'armbands'], false)
    ).toBe(false);
  });

  it('does not request a nested download sync while a full sync is already running', () => {
    expect(shouldRequestPostUploadSync(['entries'], ['shows', 'entries', 'armbands'], true)).toBe(
      false
    );
  });
});
