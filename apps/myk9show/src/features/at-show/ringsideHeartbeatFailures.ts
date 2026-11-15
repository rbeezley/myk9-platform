/**
 * ringsideHeartbeatFailures — make a persistent presence-heartbeat refusal visible (MYK9-2033).
 *
 * The heartbeat is best-effort, so one failed beat stays quiet and the user never sees a toast.
 * But a refusal that repeats on every beat (MYK9-2033: a per-judge passcode session got 403
 * every 30 s for a whole show day) was invisible anywhere but the edge logs. Once the server
 * has refused HEARTBEAT_FAILURE_REPORT_THRESHOLD beats in a row, report it ONCE to Sentry and
 * the logger; a successful beat ends the streak and re-arms the report.
 *
 * Only server answers count: a beat that never reached the database (offline, a dropped
 * connection) carries no SQLSTATE `code` and is an ordinary show-ground blip, not a defect.
 */

import { captureRingsideHeartbeatFailure } from '@/services/observability/sentry';
import { logger } from '@/utils/logger';

/** Consecutive refused beats before reporting: 3 beats is about 90 seconds. */
export const HEARTBEAT_FAILURE_REPORT_THRESHOLD = 3;

export interface HeartbeatRefusal {
  code?: string;
  message?: string;
}

export interface HeartbeatFailureTracker {
  recordSuccess(): void;
  recordFailure(error: HeartbeatRefusal): void;
}

export function createHeartbeatFailureTracker(): HeartbeatFailureTracker {
  let streak = 0;
  let reported = false;

  return {
    recordSuccess() {
      streak = 0;
      reported = false;
    },
    recordFailure(error) {
      if (!error.code) return;
      streak += 1;
      if (reported || streak < HEARTBEAT_FAILURE_REPORT_THRESHOLD) return;
      reported = true;
      logger.warn('[at-show] ringside presence heartbeat keeps being refused', 'at-show', {
        code: error.code,
        message: error.message,
        consecutiveFailures: streak,
      });
      captureRingsideHeartbeatFailure(error, streak);
    },
  };
}
