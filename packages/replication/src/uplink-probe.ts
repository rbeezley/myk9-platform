import { isRetryableError, isTransportError } from './mutation-utils';
import type { PendingMutation } from './types';

/**
 * Decides, once per upload pass, whether a transport-candidate failure means the uplink is
 * down (MYK9-1474). The error's shape cannot say so: postgrest wraps every fetch-path
 * rejection, including client bugs, as `TypeError: ...`. The injected probe is the evidence.
 *
 * Resolves true ONLY when the error is a retryable transport candidate AND the probe reports
 * the server unreachable. No probe, a probe that throws, or a reachable server all resolve
 * false, so the failure spends `maxRetries` exactly as before. The probe never runs for
 * refusals or ordinary errors, and its answer is shared by every failure in the pass.
 */
export function createUplinkProbe(checkConnectivity?: () => Promise<boolean>) {
  let reachable: Promise<boolean> | undefined;
  return async (error: unknown, mutation: PendingMutation): Promise<boolean> => {
    if (!checkConnectivity) return false;
    if (!isRetryableError(error, mutation) || !isTransportError(error)) return false;
    reachable ??= checkConnectivity().catch(() => true);
    return !(await reachable);
  };
}
