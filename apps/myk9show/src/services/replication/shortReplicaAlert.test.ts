import { beforeEach, describe, expect, it, vi } from 'vitest';

const capture = vi.hoisted(() => vi.fn());
vi.mock('@/services/observability/sentry', () => ({ captureShortReplica: capture }));

import {
  clearShortReplica,
  reportShortReplica,
  resetShortReplicaAlertsForTests,
} from './shortReplicaAlert';

const info = { table: 'classes', scope: 'trial-1', serverCount: 5, deviceCount: 3 };

describe('short replica alert (MYK9-2254)', () => {
  beforeEach(() => {
    capture.mockReset();
    resetShortReplicaAlertsForTests();
  });

  it('sends one event naming the table, scope and both counts', () => {
    reportShortReplica(info);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith(info);
  });

  it('stays quiet on every later pass while the device stays short', () => {
    reportShortReplica(info);
    reportShortReplica({ ...info, deviceCount: 4 });
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('alerts a different scope of the same table separately', () => {
    reportShortReplica(info);
    reportShortReplica({ ...info, scope: 'trial-2' });
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it('alerts again after the scope came back whole and fell short once more', () => {
    reportShortReplica(info);
    clearShortReplica('classes', 'trial-1');
    reportShortReplica(info);
    expect(capture).toHaveBeenCalledTimes(2);
  });
});
