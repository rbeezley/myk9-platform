import { describe, it, expect } from 'vitest';
import {
  parseMovedUpFromClassId,
  resolveMoveUpDisplay,
  type MoveUpLinkInput,
} from './moveUpDisplay';

// Mirrors the note written by processMoveUp / showMapActionMutations.
const movedNote = (sourceClassId: string, reason?: string) =>
  `Moved up from class ${sourceClassId}${reason ? ': ' + reason : ''}`;

function source(overrides: Partial<MoveUpLinkInput> = {}): MoveUpLinkInput {
  return {
    id: 'src-1',
    dogId: 'dog-1',
    classId: 'class-novice',
    status: 'moved',
    specialRequests: 'Moved up to Excellent',
    ...overrides,
  };
}

function destination(overrides: Partial<MoveUpLinkInput> = {}): MoveUpLinkInput {
  return {
    id: 'dest-1',
    dogId: 'dog-1',
    classId: 'class-excellent',
    status: 'confirmed',
    specialRequests: movedNote('class-novice'),
    ...overrides,
  };
}

describe('parseMovedUpFromClassId', () => {
  it('extracts the source class id from the note', () => {
    expect(parseMovedUpFromClassId(movedNote('class-novice'))).toBe('class-novice');
  });

  it('ignores a trailing reason after the colon', () => {
    expect(parseMovedUpFromClassId(movedNote('class-novice', 'qualified early'))).toBe(
      'class-novice'
    );
  });

  it('extracts a UUID source class id', () => {
    const uuid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    expect(parseMovedUpFromClassId(movedNote(uuid))).toBe(uuid);
  });

  it('returns null for unrelated or empty notes', () => {
    expect(parseMovedUpFromClassId('Pull denied: late')).toBeNull();
    expect(parseMovedUpFromClassId(undefined)).toBeNull();
    expect(parseMovedUpFromClassId('')).toBeNull();
  });
});

describe('resolveMoveUpDisplay', () => {
  it('suppresses the moved source row when its destination exists', () => {
    const { suppressedEntryIds } = resolveMoveUpDisplay([source(), destination()]);
    expect(suppressedEntryIds.has('src-1')).toBe(true);
    expect(suppressedEntryIds.has('dest-1')).toBe(false);
  });

  it('annotates the destination with its source class id', () => {
    const { movedUpFromClassIdByEntryId } = resolveMoveUpDisplay([source(), destination()]);
    expect(movedUpFromClassIdByEntryId.get('dest-1')).toBe('class-novice');
  });

  it('does NOT suppress a moved row that has no destination (half-failed move)', () => {
    const { suppressedEntryIds } = resolveMoveUpDisplay([source()]);
    expect(suppressedEntryIds.size).toBe(0);
  });

  it('keys the linkage per-dog so another dog moved from the same class is unaffected', () => {
    const dog1Src = source({ id: 'src-1', dogId: 'dog-1' });
    const dog1Dest = destination({ id: 'dest-1', dogId: 'dog-1' });
    // dog-2 has a moved source in the same old class, but no destination yet.
    const dog2Src = source({ id: 'src-2', dogId: 'dog-2' });
    const { suppressedEntryIds } = resolveMoveUpDisplay([dog1Src, dog1Dest, dog2Src]);
    expect(suppressedEntryIds.has('src-1')).toBe(true);
    expect(suppressedEntryIds.has('src-2')).toBe(false);
  });

  it('handles a dog that moved up twice (chained moves)', () => {
    const novice = source({ id: 'src-novice', classId: 'class-novice' });
    const advanced = source({
      id: 'src-advanced',
      classId: 'class-advanced',
      specialRequests: 'Moved up to Excellent',
    });
    const destAdvanced = destination({
      id: 'dest-advanced',
      classId: 'class-advanced',
      status: 'moved',
      specialRequests: movedNote('class-novice'),
    });
    const destExcellent = destination({
      id: 'dest-excellent',
      classId: 'class-excellent',
      specialRequests: movedNote('class-advanced'),
    });
    const { suppressedEntryIds, movedUpFromClassIdByEntryId } = resolveMoveUpDisplay([
      novice,
      advanced,
      destAdvanced,
      destExcellent,
    ]);
    // Both intermediate 'moved' rows are suppressed; only the final row survives.
    expect(suppressedEntryIds.has('src-novice')).toBe(true);
    expect(suppressedEntryIds.has('src-advanced')).toBe(true);
    expect(suppressedEntryIds.has('dest-advanced')).toBe(true);
    expect(suppressedEntryIds.has('dest-excellent')).toBe(false);
    expect(movedUpFromClassIdByEntryId.get('dest-excellent')).toBe('class-advanced');
  });

  it('returns empty resolution when there are no move-ups', () => {
    const { suppressedEntryIds, movedUpFromClassIdByEntryId } = resolveMoveUpDisplay([
      { id: 'e1', dogId: 'dog-1', classId: 'class-novice', status: 'confirmed' },
    ]);
    expect(suppressedEntryIds.size).toBe(0);
    expect(movedUpFromClassIdByEntryId.size).toBe(0);
  });
});
