import { useContext } from 'react';
import { ReplicationSyncContext } from '@/context/ReplicationSyncContext';

/**
 * Non-throwing counterpart to `useReplicationSync`, for ambient widgets that
 * may render outside the provider (tests, isolated stories) and must degrade
 * rather than crash — the `LiveUpdateIndicator` precedent.
 */
export const useOptionalReplicationSync = () => useContext(ReplicationSyncContext) ?? null;
