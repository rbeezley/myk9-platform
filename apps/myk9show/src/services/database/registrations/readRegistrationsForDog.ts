import { replicatedDogRegistrationsTable } from '@/services/replication/ReplicatedDogRegistrationsTable';
import { getRegistrationsByDog } from './reads';
import {
  normalizeDogRegistrationNumber,
  normalizeDogRegistrationOrganization,
} from '@/utils/dogIdentity';

const registryIdentity = (row: Record<string, unknown>) =>
  `${normalizeDogRegistrationOrganization(row.organization as string | null)}|${normalizeDogRegistrationNumber(row.registration_number as string | null)}`;

/**
 * Server-known rows plus this device's local-only rows, minus a local mirror of
 * a registration the server already holds under its own id (the registrations
 * RPC assigns server ids), matched on organization + number like the dog read.
 */
function mergeLocalRows(
  synced: Record<string, unknown>[],
  local: Record<string, unknown>[]
): Record<string, unknown>[] {
  const known = new Set(synced.map(registryIdentity));
  return [...synced, ...local.filter(row => !known.has(registryIdentity(row)))];
}

/**
 * One dog's registrations, newest registration date first (the order
 * `getRegistrationsByDog` uses), from the local replica once it has synced and
 * from PostgREST while it is cold (MYK9-1071). Replica-first is what makes a
 * queued add or edit show at once, offline included, and keeps a reconnect
 * refetch from reading the server before the queued write has uploaded.
 */
export async function readRegistrationsForDog(
  dogId: string
): Promise<{ data: Record<string, unknown>[]; error: unknown }> {
  if (!(await replicatedDogRegistrationsTable.isCold())) {
    try {
      const { synced, local } =
        await replicatedDogRegistrationsTable.getRegistrationsForDogsPartitioned([dogId]);
      return { data: sortByRegistrationDateDesc(mergeLocalRows(synced, local)), error: null };
    } catch {
      // An unreadable replica falls through to the server read.
    }
  }
  return getRegistrationsByDog(dogId);
}

function sortByRegistrationDateDesc(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const key = (row: Record<string, unknown>) =>
    typeof row.registration_date === 'string' ? row.registration_date : '';
  // PostgREST's `order(... desc)` puts NULLs first; keep that.
  return [...rows].sort((a, b) => {
    const left = key(a);
    const right = key(b);
    if (left === right) return 0;
    if (left === '') return -1;
    if (right === '') return 1;
    return left < right ? 1 : -1;
  });
}
