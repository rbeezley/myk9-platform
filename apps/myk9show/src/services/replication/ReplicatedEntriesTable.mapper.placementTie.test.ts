/**
 * MYK9-1473: `placement_tie` / `placement_tiebreak` on the replica path. The server derives both
 * (the placement recalculation), the replica carries them so the Results tab can derive its coin
 * flip groups offline, and NO write path may send them: a full-row UPDATE or upsert carrying either
 * column is refused 42501 by the direct-write guard and would park the write.
 */
import { describe, expect, it } from 'vitest';

import { toSecretaryEntry } from '@/services/database/entries/secretaryReadReplication';
import { entryToSupabaseRow, rowToEntry, type EntryRow } from './ReplicatedEntriesTable.mapper';
import { buildRingsideRpcFields } from './ringsideEntryRpc';

const row = (fields: Record<string, unknown> = {}) =>
  ({ id: 'entry-1', class_id: 'class-1', ...fields }) as unknown as EntryRow;

const EMPTY_RELATIONS = {
  dogsMap: new Map(),
  classesMap: new Map(),
  armbandsByEntryId: new Map(),
  armbandsByDogId: new Map(),
  peopleMap: new Map(),
  enrollmentsMap: new Map(),
  trialsMap: new Map(),
  pullMetadataMap: new Map(),
} as unknown as Parameters<typeof toSecretaryEntry>[1];

describe('placement tie state on the replica path', () => {
  it('reads both columns under both casings', () => {
    const entry = rowToEntry(row({ placement_tie: 'unresolved', placement_tiebreak: 2 }));
    expect(entry).toMatchObject({
      placementTie: 'unresolved',
      placement_tie: 'unresolved',
      placementTiebreak: 2,
      placement_tiebreak: 2,
    });
  });

  it('is undefined when the view lacks the columns or carries NULL', () => {
    for (const source of [row(), row({ placement_tie: null, placement_tiebreak: null })]) {
      const entry = rowToEntry(source);
      expect(entry.placementTie).toBeUndefined();
      expect(entry.placementTiebreak).toBeUndefined();
    }
  });

  it('reaches the secretary read the Results tab renders from (no last-hop drop)', () => {
    const secretary = toSecretaryEntry(
      rowToEntry(row({ placement_tie: 'unresolved', placement_tiebreak: 1, points_earned: 90 })),
      EMPTY_RELATIONS
    );
    expect(secretary).toMatchObject({
      placement_tie: 'unresolved',
      placement_tiebreak: 1,
      points_earned: 90,
    });
    expect(toSecretaryEntry(rowToEntry(row()), EMPTY_RELATIONS)).toMatchObject({
      placement_tie: null,
      placement_tiebreak: null,
    });
  });
});

describe('placement tie state is never written', () => {
  it('stays out of the whole-row payload, even for an entry that carries it', () => {
    const entry = rowToEntry(row({ placement_tie: 'unresolved', placement_tiebreak: 2 }));
    const upload = entryToSupabaseRow(entry);
    for (const key of [
      'placement_tie',
      'placement_tiebreak',
      'placementTie',
      'placementTiebreak',
    ]) {
      expect(upload).not.toHaveProperty(key);
    }
    // The rebuilt payload of a queued full-row UPDATE (rebuildUpdatePayload / toRemoteRow).
    const rebuilt = entryToSupabaseRow({ ...entry, finalPlacement: '2' });
    expect(Object.keys(rebuilt).filter(key => key.startsWith('placement'))).toEqual([]);
  });

  it('is not a ringside RPC column, so a write naming it is not routed as a score delta', () => {
    const supabaseRow = { final_placement: 2, placement_tie: 'unresolved' };
    expect(buildRingsideRpcFields(['placementTie'], supabaseRow)).toBeNull();
    expect(buildRingsideRpcFields(['finalPlacement', 'placementTie'], supabaseRow)).toBeNull();
    expect(buildRingsideRpcFields(['finalPlacement'], supabaseRow)).toEqual({ final_placement: 2 });
  });
});
