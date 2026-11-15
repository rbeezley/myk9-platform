import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createHeartbeatFailureTracker,
  HEARTBEAT_FAILURE_REPORT_THRESHOLD,
} from '../ringsideHeartbeatFailures';

const { captureMock, warnMock } = vi.hoisted(() => ({
  captureMock: vi.fn(),
  warnMock: vi.fn(),
}));

vi.mock('@/services/observability/sentry', () => ({
  captureRingsideHeartbeatFailure: captureMock,
}));

vi.mock('@/utils/logger', () => ({
  logger: { warn: warnMock },
}));

const REFUSAL = {
  code: '42501',
  message: 'account is not entered in exactly one active ringside show',
};

function refuse(tracker: ReturnType<typeof createHeartbeatFailureTracker>, times: number) {
  for (let i = 0; i < times; i += 1) tracker.recordFailure(REFUSAL);
}

describe('createHeartbeatFailureTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stays quiet below the threshold', () => {
    const tracker = createHeartbeatFailureTracker();
    refuse(tracker, HEARTBEAT_FAILURE_REPORT_THRESHOLD - 1);

    expect(captureMock).not.toHaveBeenCalled();
    expect(warnMock).not.toHaveBeenCalled();
  });

  it('reports a persistent refusal once, with its code and streak', () => {
    const tracker = createHeartbeatFailureTracker();
    refuse(tracker, HEARTBEAT_FAILURE_REPORT_THRESHOLD + 5);

    expect(captureMock).toHaveBeenCalledTimes(1);
    expect(captureMock).toHaveBeenCalledWith(REFUSAL, HEARTBEAT_FAILURE_REPORT_THRESHOLD);
    expect(warnMock).toHaveBeenCalledTimes(1);
    expect(warnMock).toHaveBeenCalledWith(
      '[at-show] ringside presence heartbeat keeps being refused',
      'at-show',
      {
        code: '42501',
        message: REFUSAL.message,
        consecutiveFailures: HEARTBEAT_FAILURE_REPORT_THRESHOLD,
      }
    );
  });

  it('a successful beat ends the streak and re-arms the report', () => {
    const tracker = createHeartbeatFailureTracker();
    refuse(tracker, HEARTBEAT_FAILURE_REPORT_THRESHOLD - 1);
    tracker.recordSuccess();
    refuse(tracker, HEARTBEAT_FAILURE_REPORT_THRESHOLD - 1);
    expect(captureMock).not.toHaveBeenCalled();

    refuse(tracker, 1);
    expect(captureMock).toHaveBeenCalledTimes(1);

    tracker.recordSuccess();
    refuse(tracker, HEARTBEAT_FAILURE_REPORT_THRESHOLD);
    expect(captureMock).toHaveBeenCalledTimes(2);
  });

  it('ignores beats that never reached the server (no SQLSTATE code)', () => {
    const tracker = createHeartbeatFailureTracker();
    for (let i = 0; i < HEARTBEAT_FAILURE_REPORT_THRESHOLD * 2; i += 1) {
      tracker.recordFailure({ code: '', message: 'TypeError: Failed to fetch' });
      tracker.recordFailure({ message: 'offline' });
    }

    expect(captureMock).not.toHaveBeenCalled();
    expect(warnMock).not.toHaveBeenCalled();
  });
});
