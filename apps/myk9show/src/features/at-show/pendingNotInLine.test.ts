import { describe, expect, it } from 'vitest';
import { findInRingEntry, pendingByRunOrder } from '@myk9/ringside';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import { normalizeCanonicalEntry } from '@/hooks/useShowEntriesForUser';
import { dogsAheadInClass, ownEntryQueueState } from '@/utils/showEntryRunQueue';
import { replicatedToEntry } from '@/store/entry-store-helpers';
import { classifyEntries } from '@/features/_shared/entryAccounting';
import { transformEntry } from './atShowDataAdapter';
import { buildNextUpPreview } from './atShowNextUpPreview';

// MYK9-2391: a Pending (not yet approved) entry is not in the running line. One rule lives in the
// run queue; the class row's preview, the entry list's "Up next" and the exhibitor's place all read it.
const row = (id: string, armband: string, runOrder: number, extra: Partial<ReplicatedEntry> = {}) =>
  ({ id, classId: 'c', armband, runOrder, entryStatus: 'confirmed', ...extra }) as ReplicatedEntry;

describe('a Pending entry is not in the running line', () => {
  const entries = [
    row('p', '1', 1, { entryStatus: 'pending' }),
    row('a', '2', 2),
    row('b', '3', 3, { checkInStatus: 'completed' }),
    row('c', '4', 4),
  ];

  it('the class preview and the entry list name the same next dog and the same remaining dogs', () => {
    const preview = buildNextUpPreview(entries);
    const listRows = entries.map(entry => transformEntry(entry, null));
    const next = pendingByRunOrder(listRows).map(listRow => listRow.id);

    expect(next).toEqual(['a', 'c']);
    expect(preview.nextArmbands).toEqual(['2', '4']);
    // A Pending dog and a completed check-in are not still to run.
    expect(preview.remaining).toBe(next.length);
  });

  it('the entry list never flags a Pending dog as in the ring', () => {
    const listRows = [row('p', '1', 1, { entryStatus: 'submitted', checkInStatus: 'in-ring' })].map(
      entry => transformEntry(entry, null)
    );
    expect(listRows[0]?.inRing).toBe(false);
    expect(findInRingEntry(listRows)).toBeNull();
  });

  it('the Pending dog keeps its accounting tab and counts', () => {
    const groups = classifyEntries(
      entries.map(entry => ({ ...entry, entryStatus: entry.entryStatus }))
    );
    expect(groups.p).toBe('pending');
    expect(buildNextUpPreview(entries).total).toBe(4);
  });
});

describe('the exhibitor place for a missing entry status', () => {
  const canonical = (entryStatus: string | null, id: string, runOrder: number) => {
    const entry = normalizeCanonicalEntry({
      id,
      show_id: 's',
      class_id: 'c',
      dog_id: 'd',
      entry_status: entryStatus,
      run_order: runOrder,
      armband: String(runOrder),
      updated_at: '2026-08-01T09:15:00Z',
    } as never);
    if (!entry) throw new Error('row did not normalize');
    return entry;
  };

  it('a NULL entry_status is runnable, the literal no-status is Pending', () => {
    const nullStatus = canonical(null, 'n', 2);
    const pending = canonical('no-status', 'p', 1);
    const entries = [pending, nullStatus];

    expect(ownEntryQueueState(nullStatus)).toEqual({ kind: 'waiting-unknown' });
    expect(ownEntryQueueState(pending)).toBeNull();
    expect(dogsAheadInClass(entries, 'n')).toBe(0);
    expect(dogsAheadInClass(entries, 'p')).toBeNull();
  });

  it('the replicated read agrees: a NULL entry_status is runnable, a stated draft is Pending', () => {
    const replicated = (entryStatus: string | undefined, id: string, runOrder: number) =>
      replicatedToEntry(
        row(id, String(runOrder), runOrder, { entryStatus } as Partial<ReplicatedEntry>)
      );
    const nullStatus = replicated(undefined, 'n', 2);
    const draft = replicated('draft', 'd', 1);

    expect(nullStatus.lifecycleMissing).toBe(true);
    expect(draft.lifecycleMissing).toBeUndefined();
    expect(ownEntryQueueState(nullStatus)).toEqual({ kind: 'waiting-unknown' });
    expect(ownEntryQueueState(draft)).toBeNull();
    expect(dogsAheadInClass([draft, nullStatus], 'n')).toBe(0);
    expect(dogsAheadInClass([draft, nullStatus], 'd')).toBeNull();
  });
});
