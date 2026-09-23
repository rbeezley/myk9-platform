import { describe, expect, it } from 'vitest';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import { projectEntryHandlerIdentity } from './entryHandlerProjection';

const owner = { id: 'owner-1', first_name: 'Olivia', last_name: 'Owner' };
const assigned = { id: 'handler-1', first_name: 'Harper', last_name: 'Handler' };
const people = new Map([
  [owner.id, owner],
  [assigned.id, assigned],
]);

function entry(overrides: Partial<ReplicatedEntry>): ReplicatedEntry {
  return {
    id: 'entry-1',
    dogId: 'dog-1',
    ...overrides,
  };
}

const proxyEntry = entry({
  handlerId: assigned.id,
  handler: undefined,
  dogOwnerId: owner.id,
});

const ownerHandledEntry = entry({ dogOwnerId: owner.id });

const unresolvedAssignedEntry = entry({
  handlerId: 'missing-handler',
  handler: undefined,
  dogOwnerId: owner.id,
});

const textAssignedEntry = entry({
  handlerId: assigned.id,
  handler: 'Typed Handler',
  dogOwnerId: owner.id,
});

const conflictingHandlerAliasesEntry = entry({
  handlerId: assigned.id,
  handler: 'New Handler',
  handlerName: 'Old Handler',
  dogOwnerId: owner.id,
});

describe('projectEntryHandlerIdentity', () => {
  it('uses the assigned person for a replicated handler-id-only entry', () => {
    expect(projectEntryHandlerIdentity(proxyEntry, people)).toMatchObject({
      name: 'Harper Handler',
      source: 'assigned-person',
    });
  });

  it('falls back to the owner when assigned text and identity are absent', () => {
    expect(projectEntryHandlerIdentity(ownerHandledEntry, people)).toMatchObject({
      name: 'Olivia Owner',
      source: 'owner',
    });
  });

  it('keeps an assigned-but-unresolved handler unknown', () => {
    expect(projectEntryHandlerIdentity(unresolvedAssignedEntry, people).source).toBe('unknown');
  });

  it('preserves entries.handler as the printed authority', () => {
    expect(projectEntryHandlerIdentity(textAssignedEntry, people).name).toBe('Typed Handler');
  });

  it('uses entries.handler over a stale handlerName alias', () => {
    expect(projectEntryHandlerIdentity(conflictingHandlerAliasesEntry, people).name).toBe(
      'New Handler'
    );
  });
});
