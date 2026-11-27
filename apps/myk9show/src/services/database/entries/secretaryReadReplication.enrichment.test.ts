import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  pullMetadata: vi.fn(),
  entries: [] as Array<Record<string, unknown>>,
}));

vi.mock('../supabaseClient', () => ({ supabase: { from: mocks.from } }));
vi.mock('@/services/replication/entriesShowSyncState', () => ({
  assertShowEntriesNotForeign: vi.fn(async () => undefined),
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    getEntriesByShow: vi.fn(async () => mocks.entries),
    getSyncMetadata: vi.fn(async () => ({ totalRows: mocks.entries.length })),
  },
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: { getAllDogs: vi.fn(async () => []) },
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: { getAllOrThrow: vi.fn(async () => []) },
}));
vi.mock('@/services/replication/ReplicatedArmbandsTable', () => ({
  replicatedArmbandsTable: { getByShow: vi.fn(async () => []) },
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: { getTrialsByShow: vi.fn(async () => []) },
}));
vi.mock('./handlerHydration', async importOriginal => ({
  ...(await importOriginal<typeof import('./handlerHydration')>()),
  loadHandlerPeople: vi.fn(async () => new Map()),
}));
vi.mock('./secretaryPostgrest', () => ({
  postgrestGetSecretaryPullMetadataMap: mocks.pullMetadata,
}));

import { ID_CHUNK_SIZE } from '@/utils/chunkIds';
import { getReplicatedSecretaryEntriesForShow } from './secretaryReadReplication';

const ENROLLMENT = (id: string) => ({ id, confirmation_number: `C-${id}` });

/** A PostgREST builder whose `.in()` batches are recorded and whose result is `respond(batch)`. */
function fakeEnrichmentTables(respond: (relation: string, batch: string[]) => Promise<unknown>) {
  const batches: Array<{ relation: string; ids: string[]; signal: AbortSignal | undefined }> = [];
  mocks.from.mockImplementation((relation: string) => {
    let ids: string[] = [];
    const query = {
      select: vi.fn(() => query),
      in: vi.fn((_column: string, batch: string[]) => {
        ids = batch;
        return query;
      }),
      abortSignal: vi.fn((signal: AbortSignal) => {
        batches.push({ relation, ids, signal });
        return respond(relation, ids);
      }),
    };
    return query;
  });
  return batches;
}

function entriesWith(count: number) {
  mocks.entries = Array.from({ length: count }, (_, index) => ({
    id: `entry-${index}`,
    showId: 'show-1',
    entryStatus: 'confirmed',
    registrationId: `reg-${index}`,
    handlerId: `person-${index}`,
  }));
}

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: online });
}

describe('getReplicatedSecretaryEntriesForShow enrichment reads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pullMetadata.mockResolvedValue(new Map());
    setOnline(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    setOnline(true);
  });

  it('chunks the people and enrollment id lists so no request carries them all', async () => {
    entriesWith(ID_CHUNK_SIZE * 2 + 30);
    const batches = fakeEnrichmentTables(async (relation, ids) => ({
      data: ids.map(id => (relation === 'people' ? { id } : ENROLLMENT(id))),
      error: null,
    }));

    const { data } = await getReplicatedSecretaryEntriesForShow('show-1');

    expect(data).toHaveLength(ID_CHUNK_SIZE * 2 + 30);
    for (const relation of ['people', 'enrollments']) {
      const sizes = batches.filter(b => b.relation === relation).map(b => b.ids.length);
      expect(sizes.sort((a, b) => b - a)).toEqual([ID_CHUNK_SIZE, ID_CHUNK_SIZE, 30]);
    }
    // Every id is read exactly once across the chunks.
    const enrollmentIds = batches.filter(b => b.relation === 'enrollments').flatMap(b => b.ids);
    expect(new Set(enrollmentIds).size).toBe(ID_CHUNK_SIZE * 2 + 30);
    expect(batches.every(b => b.signal instanceof AbortSignal)).toBe(true);
    // The merged map is whole: a chunk's rows are not lost to the next.
    expect(data.every(entry => entry.registration?.confirmation_number)).toBe(true);
  });

  it('never touches the network for enrichment when the browser is offline', async () => {
    setOnline(false);
    entriesWith(3);
    fakeEnrichmentTables(async () => ({ data: [], error: null }));

    const { data, error } = await getReplicatedSecretaryEntriesForShow('show-1');

    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.pullMetadata).not.toHaveBeenCalled();
    // The roster still renders from the replica, and decisions read as unknown, not "none".
    expect(error).toBeNull();
    expect(data).toHaveLength(3);
    expect(data.every(entry => entry.refund_decision_unknown === true)).toBe(true);
  });

  it('degrades to the replicated roster, not to no entries, when the reads hang', async () => {
    vi.useFakeTimers();
    entriesWith(2);
    fakeEnrichmentTables(() => new Promise(() => undefined));
    mocks.pullMetadata.mockReturnValue(new Promise(() => undefined));

    const pending = getReplicatedSecretaryEntriesForShow('show-1');
    await vi.advanceTimersByTimeAsync(20_000);
    const { data } = await pending;

    expect(data).toHaveLength(2);
    expect(data.every(entry => entry.refund_decision_unknown === true)).toBe(true);
  });

  it('treats a failed chunk as enrichment unavailable rather than a partial map', async () => {
    entriesWith(ID_CHUNK_SIZE + 5);
    let calls = 0;
    fakeEnrichmentTables(async (relation, ids) => {
      calls += 1;
      return relation === 'enrollments' && calls % 2 === 0
        ? { data: null, error: { message: 'network' } }
        : { data: ids.map(id => (relation === 'people' ? { id } : ENROLLMENT(id))), error: null };
    });

    const { data } = await getReplicatedSecretaryEntriesForShow('show-1');

    expect(data).toHaveLength(ID_CHUNK_SIZE + 5);
  });
});
