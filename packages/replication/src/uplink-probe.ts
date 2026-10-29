import { isRetryableError, isTransportError } from './mutation-utils';
import type { PendingMutation } from './types';

/** How long one probe answer stands for later failures in the same upload pass. */
export const UPLINK_PROBE_ANSWER_TTL_MS = 10_000;

/**
 * Decides, per upload pass, whether a transport-candidate failure means the uplink is down
 * (MYK9-1474). The error's shape cannot say so: postgrest wraps every fetch-path rejection,
 * including client bugs, as `TypeError: ...`. The injected probe is the evidence.
 *
 * Resolves true ONLY when the error is a retryable transport candidate AND the probe reports
 * the server unreachable. No probe, a probe that throws, or a reachable server all resolve
 * false, so the failure spends `maxRetries` exactly as before. The probe never runs for
 * refusals or ordinary errors. Its answer is shared by later failures in the pass for
 * `UPLINK_PROBE_ANSWER_TTL_MS` after it arrived, then asked again, so a long pass that spans
 * the uplink dropping or returning does not classify on stale evidence.
 */
export function createUplinkProbe(
  checkConnectivity?: () => Promise<boolean>,
  now: () => number = Date.now
) {
  let reachable: Promise<boolean> | undefined;
  let answeredAt: number | undefined;
  return async (error: unknown, mutation: PendingMutation): Promise<boolean> => {
    if (!checkConnectivity) return false;
    if (!isRetryableError(error, mutation) || !isTransportError(error)) return false;
    if (answeredAt !== undefined && now() - answeredAt > UPLINK_PROBE_ANSWER_TTL_MS) {
      reachable = undefined;
      answeredAt = undefined;
    }
    reachable ??= checkConnectivity()
      .catch(() => true)
      .then(answer => {
        answeredAt = now();
        return answer;
      });
    return !(await reachable);
  };
}
