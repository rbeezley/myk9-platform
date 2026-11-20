import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setShortReplicaReporter, type ShortReplicaObservation } from '@myk9/replication';
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

const shortOf = (tableName: string, scope: string | undefined, deviceCount = 1) => ({
  tableName,
  scope,
  serverCount: 3,
  deviceCount,
});
const short = (
  tableName: string,
  scope: string | undefined,
  deviceCount = 1
): ShortReplicaObservation => ({
  tableName,
  scope,
  short: shortOf(tableName, scope, deviceCount),
});
const whole = (tableName: string, scope: string | undefined): ShortReplicaObservation => ({
  tableName,
  scope,
  short: null,
});

describe('reportShortReplica (MYK9-2254)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetShortReplicaReportsForTests();
    setShortReplicaReporter(null);
  });

  it('sends one event naming the table, scope, server count and device count', () => {
    reportShortReplica(short('trials', 'show-1'));

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
    reportShortReplica(short('trials', 'show-1'));
    reportShortReplica(short('trials', 'show-1', 2));
    reportShortReplica(short('trials', 'show-1'));

    expect(captureMessage).toHaveBeenCalledTimes(1);
  });

  it('keeps A silent when another table B completes whole in between', () => {
    reportShortReplica(short('trials', 'show-1'));
    reportShortReplica(whole('classes', 'trial-1'));
    reportShortReplica(whole('trials', 'show-2'));
    reportShortReplica(short('trials', 'show-1'));

    expect(captureMessage).toHaveBeenCalledTimes(1);
  });

  it('reports again after that table and scope was whole: short, whole, short is two events', () => {
    reportShortReplica(short('trials', 'show-1'));
    reportShortReplica(whole('trials', 'show-1'));
    reportShortReplica(short('trials', 'show-1'));

    expect(captureMessage).toHaveBeenCalledTimes(2);
  });

  it('re-arms an unscoped table the same way', () => {
    reportShortReplica(short('armbands', undefined));
    reportShortReplica(short('armbands', undefined));
    reportShortReplica(whole('armbands', undefined));
    reportShortReplica(short('armbands', undefined));

    expect(captureMessage).toHaveBeenCalledTimes(2);
  });

  it('reports a second scope of the same table once, separately', () => {
    reportShortReplica(short('trials', 'show-1'));
    reportShortReplica(short('trials', 'show-2'));
    reportShortReplica(short('trials', 'show-2'));

    expect(captureMessage).toHaveBeenCalledTimes(2);
  });

  it('sends nothing for a whole download', () => {
    reportShortReplica(whole('trials', 'show-1'));
    expect(captureMessage).not.toHaveBeenCalled();
  });
});
