import { detectConflicts } from '../conflictDetection';
import type { ShowEntry } from '@/store/entry-store-types';

function makeEntry(overrides: {
  id?: string;
  classId: string;
  dogId: string;
  armband?: string;
  scored?: boolean;
  checkInStatus?: string;
}): ShowEntry {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    showId: 'show-1',
    classId: overrides.classId,
    dogId: overrides.dogId,
    status: 'confirmed',
    checkInStatus: (overrides.checkInStatus as ShowEntry['checkInStatus']) ?? undefined,
    registrationData: {
      submittedAt: new Date().toISOString(),
      handler: 'Handler',
      entryFee: 30,
      paymentStatus: 'paid',
      armband: overrides.armband ?? '100',
    },
    competitionData: overrides.scored
      ? { recordedBy: 'judge', recordedAt: new Date().toISOString() }
      : undefined,
    statusHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as ShowEntry;
}

interface ClassContext {
  classId: string;
  className: string;
  status: string;
  entries: ShowEntry[];
}

describe('detectConflicts', () => {
  it('detects same dog near-up in another in-progress class', () => {
    const classes: ClassContext[] = [
      {
        classId: 'class-A',
        className: 'Novice A',
        status: 'In Progress',
        entries: [
          makeEntry({ classId: 'class-A', dogId: 'dog-1', armband: '100' }),
          makeEntry({ classId: 'class-A', dogId: 'dog-2', armband: '200' }),
          makeEntry({ classId: 'class-A', dogId: 'dog-3', armband: '300' }),
        ],
      },
      {
        classId: 'class-B',
        className: 'Excellent B',
        status: 'In Progress',
        entries: [
          makeEntry({
            classId: 'class-B',
            dogId: 'dog-X',
            armband: '100',
            checkInStatus: 'in-ring',
          }),
          makeEntry({ classId: 'class-B', dogId: 'dog-1', armband: '200' }),
          makeEntry({ classId: 'class-B', dogId: 'dog-Y', armband: '300' }),
        ],
      },
    ];
    const conflicts = detectConflicts('dog-1', 'class-A', classes, 3);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toEqual({ className: 'Excellent B', dogsAhead: 1 });
  });

  it('returns empty array when no conflicts', () => {
    const classes: ClassContext[] = [
      {
        classId: 'class-A',
        className: 'Novice A',
        status: 'In Progress',
        entries: [makeEntry({ classId: 'class-A', dogId: 'dog-1', armband: '100' })],
      },
      {
        classId: 'class-B',
        className: 'Excellent B',
        status: 'In Progress',
        entries: [makeEntry({ classId: 'class-B', dogId: 'dog-2', armband: '100' })],
      },
    ];
    expect(detectConflicts('dog-1', 'class-A', classes, 3)).toEqual([]);
  });

  it('handles multiple conflicts across multiple classes', () => {
    const classes: ClassContext[] = [
      {
        classId: 'class-A',
        className: 'Novice A',
        status: 'In Progress',
        entries: [makeEntry({ classId: 'class-A', dogId: 'dog-1', armband: '100' })],
      },
      {
        classId: 'class-B',
        className: 'Excellent B',
        status: 'In Progress',
        entries: [
          makeEntry({
            classId: 'class-B',
            dogId: 'dog-X',
            armband: '100',
            checkInStatus: 'in-ring',
          }),
          makeEntry({ classId: 'class-B', dogId: 'dog-1', armband: '200' }),
        ],
      },
      {
        classId: 'class-C',
        className: 'Open C',
        status: 'In Progress',
        entries: [
          makeEntry({
            classId: 'class-C',
            dogId: 'dog-Y',
            armband: '100',
            checkInStatus: 'in-ring',
          }),
          makeEntry({ classId: 'class-C', dogId: 'dog-Z', armband: '200' }),
          makeEntry({ classId: 'class-C', dogId: 'dog-1', armband: '300' }),
        ],
      },
    ];
    const conflicts = detectConflicts('dog-1', 'class-A', classes, 3);
    expect(conflicts).toHaveLength(2);
    expect(conflicts[0].className).toBe('Excellent B');
    expect(conflicts[1].className).toBe('Open C');
  });

  it('ignores completed/cancelled classes', () => {
    const classes: ClassContext[] = [
      {
        classId: 'class-A',
        className: 'Novice A',
        status: 'In Progress',
        entries: [makeEntry({ classId: 'class-A', dogId: 'dog-1', armband: '100' })],
      },
      {
        classId: 'class-B',
        className: 'Excellent B',
        status: 'Completed',
        entries: [makeEntry({ classId: 'class-B', dogId: 'dog-1', armband: '100' })],
      },
    ];
    expect(detectConflicts('dog-1', 'class-A', classes, 3)).toEqual([]);
  });

  it('ignores the current class (no self-conflict)', () => {
    const classes: ClassContext[] = [
      {
        classId: 'class-A',
        className: 'Novice A',
        status: 'In Progress',
        entries: [
          makeEntry({
            classId: 'class-A',
            dogId: 'dog-X',
            armband: '100',
            checkInStatus: 'in-ring',
          }),
          makeEntry({ classId: 'class-A', dogId: 'dog-1', armband: '200' }),
        ],
      },
    ];
    expect(detectConflicts('dog-1', 'class-A', classes, 3)).toEqual([]);
  });

  it('does not report conflict when dog is beyond leadDogs range', () => {
    const classes: ClassContext[] = [
      {
        classId: 'class-A',
        className: 'Novice A',
        status: 'In Progress',
        entries: [makeEntry({ classId: 'class-A', dogId: 'dog-1', armband: '100' })],
      },
      {
        classId: 'class-B',
        className: 'Excellent B',
        status: 'In Progress',
        entries: [
          makeEntry({
            classId: 'class-B',
            dogId: 'dog-X',
            armband: '100',
            checkInStatus: 'in-ring',
          }),
          makeEntry({ classId: 'class-B', dogId: 'dog-2', armband: '200' }),
          makeEntry({ classId: 'class-B', dogId: 'dog-3', armband: '300' }),
          makeEntry({ classId: 'class-B', dogId: 'dog-4', armband: '400' }),
          makeEntry({ classId: 'class-B', dogId: 'dog-1', armband: '500' }),
        ],
      },
    ];
    expect(detectConflicts('dog-1', 'class-A', classes, 2)).toEqual([]);
  });
});
