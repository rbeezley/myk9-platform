/**
 * MYK9-717: the Waitlist Report reads `waitlist_entries` through the same
 * replication-first read as the Entries -> Waitlist tab (`getWaitlistByClass`),
 * never `entries`.
 */
import { createDatabaseError } from '@/services/database/databaseError';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReplicatedWaitlistEntry } from '@/services/replication/ReplicatedWaitlistEntriesTable';
import type { ReplicatedDog } from '@/services/replication/ReplicatedDogsTable';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';

const {
  mockWaitlistTable,
  mockTrialsTable,
  mockClassesTable,
  mockDogsTable,
  mockEntriesTable,
  mockLoadHandlerPeople,
  mockFrom,
  mockOnlineCount,
} = vi.hoisted(() => ({
  mockWaitlistTable: {
    getByClass: vi.fn(),
    getAll: vi.fn(),
    get getAllOrThrow() {
      return this.getAll;
    },
  },
  mockTrialsTable: { getTrialsByShow: vi.fn() },
  mockClassesTable: { getClassesByTrial: vi.fn(), getClassById: vi.fn() },
  mockDogsTable: { getDogById: vi.fn() },
  mockEntriesTable: {
    getAll: vi.fn(),
    get getAllOrThrow() {
      return this.getAll;
    },
  },
  mockLoadHandlerPeople: vi.fn(),
  mockFrom: vi.fn(),
  mockOnlineCount: vi.fn(),
}));

vi.mock('@/services/replication/ReplicatedWaitlistEntriesTable', () => ({
  replicatedWaitlistEntriesTable: mockWaitlistTable,
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: mockTrialsTable,
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: mockClassesTable,
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: mockDogsTable,
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: mockEntriesTable,
}));
vi.mock('@/services/database/entries/handlerHydration', () => ({
  loadHandlerPeople: mockLoadHandlerPeople,
}));
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: mockFrom, rpc: vi.fn() },
  logQuery: vi.fn(),
  createDatabaseError,
}));

import { getWaitlistReportRows, WaitlistNotDownloadedError } from '@/services/database/waitlists';

const classes: Record<string, ReplicatedClass> = {
  'class-1': { id: 'class-1', name: 'Container Novice', trialId: 'trial-1', maxEntries: 2 },
  'class-2': { id: 'class-2', name: 'Interior Novice', trialId: 'trial-1', maxEntries: 2 },
};

const dogs: Record<string, ReplicatedDog> = {
  'dog-1': { id: 'dog-1', name: 'Buddy', callName: 'Buddy', breed: 'Lab', ownerId: 'owner-1' },
  'dog-2': { id: 'dog-2', name: 'Rex', callName: 'Rex', breed: 'Beagle', ownerId: 'owner-2' },
};

function waiting(overrides: Partial<ReplicatedWaitlistEntry>): ReplicatedWaitlistEntry {
  return {
    id: 'wl',
    classId: 'class-1',
    dogId: 'dog-1',
    exhibitorId: 'exhib-1',
    position: 1,
    status: 'waiting',
    ...overrides,
  };
}

/** The online-verify chain: from().select().in().or() resolves to a count. */
let lastQuery: { in: ReturnType<typeof vi.fn>; or: ReturnType<typeof vi.fn> };

describe('getWaitlistReportRows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(() => {
      const query = {
        select: vi.fn(() => query),
        in: vi.fn(() => query),
        or: vi.fn(async () => mockOnlineCount()),
      };
      lastQuery = query;
      return query;
    });
    mockTrialsTable.getTrialsByShow.mockResolvedValue([
      { id: 'trial-1', showId: 'show-1', name: 'Saturday', date: '2026-04-01' },
    ]);
    mockClassesTable.getClassesByTrial.mockResolvedValue(Object.values(classes));
    mockClassesTable.getClassById.mockImplementation(async (id: string) => classes[id] ?? null);
    mockDogsTable.getDogById.mockImplementation(async (id: string) => dogs[id] ?? null);
    mockEntriesTable.getAll.mockResolvedValue([]);
    mockOnlineCount.mockReturnValue({ count: 0, error: null });
    mockLoadHandlerPeople.mockResolvedValue(
      new Map([
        ['handler-9', { id: 'handler-9', first_name: 'Jane', last_name: 'Mitchell' }],
        ['owner-2', { id: 'owner-2', first_name: 'Bob', last_name: 'Smith' }],
      ])
    );
  });

  it('joins dog, handler and class for every waiting row, in position order', async () => {
    const rows = [
      waiting({ id: 'wl-2', dogId: 'dog-2', position: 2 }),
      waiting({ id: 'wl-1', dogId: 'dog-1', position: 1, handlerId: 'handler-9' }),
      // An offer already went out: the Waitlist tab no longer lists it as waiting.
      waiting({ id: 'wl-x', dogId: 'dog-2', classId: 'class-2', status: 'offered' }),
    ];
    mockWaitlistTable.getAll.mockResolvedValue(rows);
    mockWaitlistTable.getByClass.mockImplementation(async (classId: string) =>
      rows.filter(r => r.classId === classId)
    );
    mockOnlineCount.mockReturnValue({ count: 2, error: null });

    await expect(getWaitlistReportRows(['class-1', 'class-2'])).resolves.toEqual([
      { id: 'wl-1', classId: 'class-1', position: 1, callName: 'Buddy', handler: 'Jane Mitchell' },
      // No handler named on the waitlist row: fall back to the dog's owner.
      { id: 'wl-2', classId: 'class-1', position: 2, callName: 'Rex', handler: 'Bob Smith' },
    ]);
    expect([...mockLoadHandlerPeople.mock.calls[0][0]].sort()).toEqual(['handler-9', 'owner-2']);
    // Only the class that has someone waiting is read row-by-row.
    expect(mockWaitlistTable.getByClass).toHaveBeenCalledTimes(1);
    expect(mockWaitlistTable.getByClass).toHaveBeenCalledWith('class-1');
  });

  it('reads only the classes it was asked about', async () => {
    const rows = [
      waiting({ id: 'wl-1', dogId: 'dog-1', position: 1 }),
      waiting({ id: 'wl-other', dogId: 'dog-2', classId: 'class-elsewhere', position: 1 }),
    ];
    mockWaitlistTable.getAll.mockResolvedValue(rows);
    mockWaitlistTable.getByClass.mockImplementation(async (classId: string) =>
      rows.filter(r => r.classId === classId)
    );

    mockOnlineCount.mockReturnValue({ count: 1, error: null });

    const result = await getWaitlistReportRows(['class-1']);

    expect(result.map(row => row.id)).toEqual(['wl-1']);
    expect(lastQuery.in).toHaveBeenCalledWith('class_id', ['class-1']);
    expect(mockWaitlistTable.getByClass).not.toHaveBeenCalledWith('class-elsewhere');
  });

  it('returns no rows, once the server agrees, when nobody is waiting', async () => {
    mockWaitlistTable.getAll.mockResolvedValue([]);
    await expect(getWaitlistReportRows(['class-1'])).resolves.toEqual([]);
    expect(mockLoadHandlerPeople).not.toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalledWith('waitlist_entries');
    expect(lastQuery.in).toHaveBeenCalledWith('class_id', ['class-1']);
    expect(lastQuery.or).toHaveBeenCalledWith('status.is.null,status.eq.waiting');
  });

  it('refuses to call an empty replica empty when the server has dogs waiting', async () => {
    mockWaitlistTable.getAll.mockResolvedValue([]);
    mockOnlineCount.mockReturnValue({ count: 2, error: null });
    await expect(getWaitlistReportRows(['class-1'])).rejects.toBeInstanceOf(
      WaitlistNotDownloadedError
    );
  });

  it('refuses to call an empty replica empty when it cannot ask the server', async () => {
    mockWaitlistTable.getAll.mockResolvedValue([]);
    mockOnlineCount.mockReturnValue({ count: null, error: { message: 'Failed to fetch' } });
    await expect(getWaitlistReportRows(['class-1'])).rejects.toBeTruthy();
  });

  it('blocks a part-synced waitlist: the server has a waiting dog this replica lacks', async () => {
    const rows = [waiting({ id: 'wl-1', dogId: 'dog-1', position: 1 })];
    mockWaitlistTable.getAll.mockResolvedValue(rows);
    mockWaitlistTable.getByClass.mockResolvedValue(rows);
    // A newer waiting row in class-2 has not synced to this device yet.
    mockOnlineCount.mockReturnValue({ count: 2, error: null });

    await expect(getWaitlistReportRows(['class-1', 'class-2'])).rejects.toBeInstanceOf(
      WaitlistNotDownloadedError
    );
  });

  it('prints the local rows when the server cannot be asked (offline)', async () => {
    const rows = [waiting({ id: 'wl-1', dogId: 'dog-1', position: 1 })];
    mockWaitlistTable.getAll.mockResolvedValue(rows);
    mockWaitlistTable.getByClass.mockResolvedValue(rows);
    mockOnlineCount.mockReturnValue({ count: null, error: { message: 'Failed to fetch' } });

    const result = await getWaitlistReportRows(['class-1']);

    expect(result.map(row => row.id)).toEqual(['wl-1']);
  });

  it('rejects instead of reporting an empty waitlist when the read fails', async () => {
    mockWaitlistTable.getAll.mockRejectedValue(new Error('IndexedDB unavailable'));
    await expect(getWaitlistReportRows(['class-1'])).rejects.toBeTruthy();
  });
});
