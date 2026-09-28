import { useNetworkStatus } from './useNetworkStatus';
import { NEEDS_CONNECTION_HINT } from '@/lib/needsConnectionHint';

/**
 * Undefined when online; `NEEDS_CONNECTION_HINT` while offline. One place
 * for the six MYK9-849 surfaces that gate a `useShowSettingsMutations`
 * write on connectivity, so the derivation can't drift between them.
 */
export function useConnectionHint(): string | undefined {
  const { isOnline } = useNetworkStatus();
  return isOnline ? undefined : NEEDS_CONNECTION_HINT;
}
