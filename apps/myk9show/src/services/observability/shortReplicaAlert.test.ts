import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncResult } from '@myk9/replication';
import { reportShortReplica, resetShortReplicaReportsForTests } from './shortReplicaAlert';

const captureMessage = vi.fn();
const scopeApi = {
  setLevel: vi.fn(),
  setTag: vi.fn(),
  setFingerprint: vi.fn(),
  setContext: vi.fn(),
};

vi.mock('@sentry/react', () => ({
  withScope: (fn: (scope: unknown) => void) => fn(scopeApi),
  captureMessage: (...args: unknown[]) => captureMessage(...args),
}));

const shortResult = (deviceCount = 1): SyncResult => ({
  tableName: 'trials',
  success: false,
  operation: 'full-sync',
  rowsAffected: 0,
  duration: 1,
  error: 'short',
  shortReplica: { tableName: 'trials', scope: 'show-1', serverCount: 3, deviceCount },
});
const okResult: SyncResult = {
  tableName: 'trials',
  success: true,
  operation: 'incremental-sync',
  rowsAffected: 0,
  duration: 1,
};

describe('reportShortReplica (MYK9-2254)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetShortReplicaReportsForTests();
  });

  it('sends one event naming the table, scope, server count and device count', () => {
    reportShortReplica(shortResult(), 'show-1');

    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(scopeApi.setContext).toHaveBeenCalledWith('short_replica', {
      table: 'trials',
      scope: 'show-1',
      serverCount: 3,
      deviceCount: 1,
    });
    expect(scopeApi.setTag).toHaveBeenCalledWith('replication_table', 'trials');
    expect(scopeApi.setTag).toHaveBeenCalledWith('replication_scope', 'show-1');
  });

  it('does not send again on every pass while the device stays short', () => {
    reportShortReplica(shortResult(), 'show-1');
    reportShortReplica(shortResult(2), 'show-1');
    reportShortReplica(shortResult(), 'show-1');

    expect(captureMessage).toHaveBeenCalledTimes(1);
  });

  it('reports again after the scope was whole in between', () => {
    reportShortReplica(shortResult(), 'show-1');
    reportShortReplica(okResult, 'show-1');
    reportShortReplica(shortResult(), 'show-1');

    expect(captureMessage).toHaveBeenCalledTimes(2);
  });

  it('keeps a different scope of the same table separate', () => {
    reportShortReplica(shortResult(), 'show-1');
    reportShortReplica(okResult, 'show-2');
    reportShortReplica(shortResult(), 'show-1');

    expect(captureMessage).toHaveBeenCalledTimes(1);
  });

  it('sends nothing for an ordinary result', () => {
    expect(reportShortReplica(okResult, 'show-1')).toBe(okResult);
    expect(captureMessage).not.toHaveBeenCalled();
  });
});
