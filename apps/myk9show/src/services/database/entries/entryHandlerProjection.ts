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
  const handlerId = entry.handlerId ?? entry.handler_id ?? null;
  const ownerId = entry.dogOwnerId ?? null;

  return projectHandlerIdentity({
    assignedHandlerName: entry.handlerName ?? entry.handler,
    assignedHandlerId: handlerId,
    assignedHandlerPerson: handlerId ? (people.get(handlerId) ?? null) : null,
    ownerPerson: ownerId ? (people.get(ownerId) ?? null) : null,
  });
}
