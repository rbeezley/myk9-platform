import { useNetworkStatus } from './useNetworkStatus';
import { NEEDS_CONNECTION_HINT } from '@/lib/needsConnectionHint';
import { useServerReachable } from '@/lib/serverReachability';

/**
 * Undefined when the server is reachable; `NEEDS_CONNECTION_HINT` while the
 * device is offline OR a settings write has just failed to reach Supabase
 * (MYK9-864). One place for the six MYK9-849 surfaces that gate a
 * `useShowSettingsMutations` write on connectivity.
 */
export function useConnectionHint(): string | undefined {
  const { isOnline } = useNetworkStatus();
  const serverReachable = useServerReachable();
  return isOnline && serverReachable ? undefined : NEEDS_CONNECTION_HINT;
}
