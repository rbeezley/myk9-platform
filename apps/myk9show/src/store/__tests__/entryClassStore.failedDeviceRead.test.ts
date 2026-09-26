import { afterEach, describe, expect, it, vi } from 'vitest';
import { replicatedClassesTable, replicatedEntriesTable } from '@/services/replication';
import { useEntryStore } from '../entryStore';
import { useClassStore } from '../classStore';

vi.mock('@/config/dataSource', async importOriginal => ({
  ...(await importOriginal<typeof import('@/config/dataSource')>()),
  shouldUseMockData: () => false,
}));

const failed = { ok: false as const, rows: [] as [], error: new Error('IDB timeout') };

/**
 * MYK9-774: getAll() answers [] for a failed device read, so a store reload
 * emptied the list and reported success. The stores read with getAllOrThrow()
 * now: a failed read is a store error, and the list already shown stays.
 * The spy fails the real table's status read, so getAll() still answers []
 * exactly as it does on a device, and only the throwing read sees the failure.
 */
describe('entry and class stores — a failed device read', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('entryStore keeps its entries and reports an error', async () => {
    vi.spyOn(replicatedEntriesTable, 'getAllWithStatus').mockResolvedValue(failed);
    useEntryStore.setState({ entries: [{ id: 'kept' }] as never, error: null });

    await useEntryStore.getState().loadEntries();

    const state = useEntryStore.getState();
    expect(state.error).not.toBeNull();
    expect(state.entries.map(e => e.id)).toEqual(['kept']);
  });

  it('classStore keeps its classes and reports an error', async () => {
    vi.spyOn(replicatedClassesTable, 'getAllWithStatus').mockResolvedValue(failed);
    useClassStore.setState({ classes: [{ id: 'kept' }] as never, error: null });

    await useClassStore.getState().loadClasses();

    const state = useClassStore.getState();
    expect(state.error).not.toBeNull();
    expect(state.classes.map(c => c.id)).toEqual(['kept']);
  });
});
