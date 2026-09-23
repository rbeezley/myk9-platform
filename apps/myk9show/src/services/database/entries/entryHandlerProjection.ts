import { projectHandlerIdentity } from '@/features/registries/handlerIdentity';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import type { HandlerPersonRow } from './handlerHydration';

export interface ProjectedEntryHandler {
  name: string | null;
  person: HandlerPersonRow | null;
  source: 'assigned-text' | 'assigned-person' | 'owner' | 'unknown';
}

export function projectEntryHandlerIdentity(
  entry: ReplicatedEntry,
  people: ReadonlyMap<string, HandlerPersonRow>
): ProjectedEntryHandler {
  const handlerId = entry.handlerId ?? null;
  const ownerId = entry.dogOwnerId ?? null;

  return projectHandlerIdentity({
    assignedHandlerName: entry.handler ?? entry.handlerName,
    assignedHandlerId: handlerId,
    assignedHandlerPerson: handlerId ? (people.get(handlerId) ?? null) : null,
    ownerPerson: ownerId ? (people.get(ownerId) ?? null) : null,
  });
}
