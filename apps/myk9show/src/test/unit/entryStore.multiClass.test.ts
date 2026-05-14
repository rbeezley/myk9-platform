import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEntryStore, type ShowEntryInput, type SyncableShowEntry } from '@/store/entryStore';

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: {
    createEntry: vi.fn().mockResolvedValue(undefined),
    updateEntry: vi.fn().mockResolvedValue(undefined),
    deleteEntry: vi.fn().mockResolvedValue(undefined),
    getAll: vi.fn().mockResolvedValue([]),
    subscribe: vi.fn(() => vi.fn()),
  },
}));

const userId = 'multi-class-test-user';
const submittedAt = '2026-06-12T14:00:00.000Z';

function entryInput(
  overrides: Partial<ShowEntryInput> & {
    registrationData?: Partial<ShowEntryInput['registrationData']>;
  }
): ShowEntryInput {
  return {
    showId: overrides.showId ?? 'test-show-123',
    classId: overrides.classId ?? 'novice-standard-12',
    dogId: overrides.dogId ?? 'test-dog-1',
    registrationData: {
      submittedAt,
      handler: 'Test Handler',
      entryFee: 25,
      paymentStatus: 'pending',
      jumpHeight: '12"',
      ...overrides.registrationData,
    },
  };
}

function findOverlappingClassPairs(
  entries: SyncableShowEntry[],
  schedule: Record<string, { startTime: string; endTime: string }>
) {
  const conflicts: string[] = [];

  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const first = schedule[entries[i].classId];
      const second = schedule[entries[j].classId];
      if (!first || !second) continue;

      const firstStart = new Date(`2026-06-12T${first.startTime}:00`);
      const firstEnd = new Date(`2026-06-12T${first.endTime}:00`);
      const secondStart = new Date(`2026-06-12T${second.startTime}:00`);
      const secondEnd = new Date(`2026-06-12T${second.endTime}:00`);

      if (firstStart < secondEnd && secondStart < firstEnd) {
        conflicts.push(`${entries[i].classId} vs ${entries[j].classId}`);
      }
    }
  }

  return conflicts;
}

describe('Phase 3.2: Entry Store - Multi-Class Entry Registration', () => {
  beforeEach(() => {
    useEntryStore.getState().clearAllEntries();
    vi.clearAllMocks();
  });

  it('creates entries for the same dog across multiple classes without replacing prior entries', async () => {
    const entryStore = useEntryStore.getState();
    const dogId = 'golden-retriever-max';

    const entries = await entryStore.createMultipleEntries(
      [
        entryInput({
          classId: 'novice-standard-12',
          dogId,
          registrationData: { handler: 'John Smith', entryFee: 25, jumpHeight: '12"' },
        }),
        entryInput({
          classId: 'novice-jumpers-12',
          dogId,
          registrationData: { handler: 'John Smith', entryFee: 25, jumpHeight: '12"' },
        }),
        entryInput({
          classId: 'open-standard-12',
          dogId,
          registrationData: { handler: 'John Smith', entryFee: 30, jumpHeight: '12"' },
        }),
      ],
      userId
    );

    expect(entries).toHaveLength(3);
    expect(entryStore.getEntriesByDog(dogId)).toHaveLength(3);
    expect(entryStore.getEntriesByShow('test-show-123')).toHaveLength(3);
    expect(entries.map(entry => entry.classId)).toEqual([
      'novice-standard-12',
      'novice-jumpers-12',
      'open-standard-12',
    ]);
    expect(entries.every(entry => entry.dogId === dogId)).toBe(true);
    expect(entries.reduce((sum, entry) => sum + entry.registrationData.entryFee, 0)).toBe(80);
  });

  it('keeps multiple dogs in the same class distinct and supports bulk status updates', async () => {
    const entryStore = useEntryStore.getState();
    const classId = 'novice-standard-16';
    const dogIds = [
      'german-shepherd-zeus',
      'golden-retriever-bella',
      'border-collie-dash',
      'lab-retriever-cooper',
      'aussie-shepherd-luna',
    ];

    const entries = await entryStore.createMultipleEntries(
      dogIds.map(dogId =>
        entryInput({
          classId,
          dogId,
          registrationData: {
            handler: 'Professional Handler Co.',
            entryFee: 25,
            jumpHeight: '16"',
          },
        })
      ),
      userId
    );

    await entryStore.updateEntriesStatus(
      entries.map(entry => entry.id),
      'submitted',
      userId,
      'Bulk submission by professional handler'
    );

    const classEntries = entryStore.getEntriesByClass(classId);
    expect(classEntries).toHaveLength(5);
    expect(new Set(classEntries.map(entry => entry.dogId)).size).toBe(5);
    expect(classEntries.every(entry => entry.status === 'submitted')).toBe(true);
    expect(classEntries.reduce((sum, entry) => sum + entry.registrationData.entryFee, 0)).toBe(125);
  });

  it('supports mixed handler payment batches while preserving show statistics', async () => {
    const entryStore = useEntryStore.getState();
    const showId = 'agility-championship-2026';

    const entries = await entryStore.createMultipleEntries(
      [
        entryInput({
          showId,
          classId: 'masters-standard-24',
          dogId: 'belgian-malinois-storm',
          registrationData: {
            handler: 'Elite Training Academy',
            handlerId: 'handler-001',
            entryFee: 40,
            jumpHeight: '24"',
            moveUpRequested: true,
          },
        }),
        entryInput({
          showId,
          classId: 'masters-jumpers-24',
          dogId: 'belgian-malinois-storm',
          registrationData: {
            handler: 'Elite Training Academy',
            handlerId: 'handler-001',
            entryFee: 40,
            jumpHeight: '24"',
          },
        }),
        entryInput({
          showId,
          classId: 'open-standard-20',
          dogId: 'australian-cattle-dog-rusty',
          registrationData: {
            handler: 'Country K9 Training',
            handlerId: 'handler-002',
            entryFee: 35,
            jumpHeight: '20"',
            specialRequests: 'First show for this dog',
          },
        }),
        entryInput({
          showId,
          classId: 'open-standard-20',
          dogId: 'border-collie-flash',
          registrationData: {
            handler: 'Country K9 Training',
            handlerId: 'handler-002',
            entryFee: 35,
            jumpHeight: '20"',
          },
        }),
        entryInput({
          showId,
          classId: 'novice-jumpers-16',
          dogId: 'golden-retriever-sunny',
          registrationData: {
            handler: 'Owner Handled',
            handlerId: 'owner-003',
            entryFee: 25,
            jumpHeight: '16"',
            specialRequests: 'Nervous dog',
          },
        }),
      ],
      userId
    );

    for (const entry of entries) {
      await entryStore.updateRegistration(entry.id, { paymentStatus: 'paid' }, userId);
    }

    await entryStore.updateEntriesStatus(
      entries.map(entry => entry.id),
      'paid',
      userId,
      'Payment confirmed'
    );

    const showEntries = entryStore.getEntriesByShow(showId);
    const stats = entryStore.getStatsForShow(showId);

    expect(showEntries).toHaveLength(5);
    expect(new Set(showEntries.map(entry => entry.registrationData.handler)).size).toBe(3);
    expect(new Set(showEntries.map(entry => entry.dogId)).size).toBe(4);
    expect(new Set(showEntries.map(entry => entry.classId)).size).toBe(4);
    expect(showEntries.filter(entry => entry.registrationData.specialRequests).length).toBe(2);
    expect(showEntries.filter(entry => entry.registrationData.moveUpRequested).length).toBe(1);
    expect(showEntries.every(entry => entry.status === 'paid')).toBe(true);
    expect(stats.totalRevenue).toBe(175);
    expect(stats.byStatus.paid).toBe(5);
  });

  it('preserves enough entry data for cross-entry conflict checks outside the browser', async () => {
    const entryStore = useEntryStore.getState();
    const dogId = 'border-collie-ace';

    await entryStore.createMultipleEntries(
      [
        entryInput({ classId: 'novice-standard-12', dogId }),
        entryInput({ classId: 'novice-jumpers-12', dogId }),
        entryInput({ classId: 'open-standard-12', dogId }),
      ],
      userId
    );

    const conflicts = findOverlappingClassPairs(entryStore.getEntriesByDog(dogId), {
      'novice-standard-12': { startTime: '09:00', endTime: '10:30' },
      'novice-jumpers-12': { startTime: '09:15', endTime: '10:45' },
      'open-standard-12': { startTime: '11:00', endTime: '12:30' },
    });

    expect(conflicts).toEqual(['novice-standard-12 vs novice-jumpers-12']);
  });
});
