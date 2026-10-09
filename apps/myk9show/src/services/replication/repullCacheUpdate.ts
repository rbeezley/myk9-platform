import type { QueryClient } from '@tanstack/react-query';
import { applyRegistrationCacheUpdate } from '@/hooks/registrationCacheUpdate';
import { registrationToRow, type ReplicatedDogRegistration } from './dogRegistrationRowMapping';
import type { RepulledRows } from './repullRefusedRows';

/**
 * Show a re-pull in the caches the UI reads (MYK9-1071). Those readers do not
 * watch the replica. Registrations go through the ONE registration cache
 * update, the same path a queued add or edit takes.
 */
export function applyRepullToCaches(queryClient: QueryClient, outcomes: RepulledRows[]): void {
  for (const outcome of outcomes) {
    if (outcome.tableName !== 'dog_registrations') continue;
    const replaced = outcome.replacedRows as ReplicatedDogRegistration[];
    const removed = outcome.removedRows as ReplicatedDogRegistration[];
    applyRegistrationCacheUpdate(queryClient, {
      upsert: replaced.map(registrationToRow),
      remove: removed.map(row => ({ id: row.id, dogId: row.dogId })),
    });
  }
}
