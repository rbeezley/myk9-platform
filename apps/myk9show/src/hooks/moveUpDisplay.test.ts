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

  it('is per-dog: a dog with no surviving entry keeps its moved row', () => {
    const dog1Src = source({ id: 'src-1', dogId: 'dog-1' });
    const dog1Dest = destination({ id: 'dest-1', dogId: 'dog-1' });
    // dog-2 has only a moved source (its move half-failed — no surviving entry).
    const dog2Src = source({ id: 'src-2', dogId: 'dog-2' });
    const { suppressedEntryIds } = resolveMoveUpDisplay([dog1Src, dog1Dest, dog2Src]);
    expect(suppressedEntryIds.has('src-1')).toBe(true); // dog-1 has a live dest
    expect(suppressedEntryIds.has('src-2')).toBe(false); // dog-2 has none
  });

  it('suppresses every moved row in a chain even after intermediate notes are overwritten', () => {
    // Regression: Novice -> Advanced -> Excellent. When Advanced is moved again,
    // markEntryMoved / the Show Map mutation OVERWRITE its "Moved up from class
    // <Novice>" note with "Moved up to Excellent", destroying the back-pointer.
    // A linkage-only rule would then leak the Novice row back; presence-based
    // suppression does not, because the dog still has a surviving Excellent row.
    const novice = source({
      id: 'src-novice',
      classId: 'class-novice',
      status: 'moved',
      specialRequests: 'Moved up to Advanced',
    });
    const advanced = source({
      id: 'src-advanced',
      classId: 'class-advanced',
      status: 'moved',
      specialRequests: 'Moved up to Excellent', // back-pointer to Novice is gone
    });
    const excellent = destination({
      id: 'dest-excellent',
      classId: 'class-excellent',
      status: 'confirmed',
      specialRequests: movedNote('class-advanced'),
    });
    const { suppressedEntryIds, movedUpFromClassIdByEntryId } = resolveMoveUpDisplay([
      novice,
      advanced,
      excellent,
    ]);
    expect(suppressedEntryIds.has('src-novice')).toBe(true);
    expect(suppressedEntryIds.has('src-advanced')).toBe(true);
    expect(suppressedEntryIds.has('dest-excellent')).toBe(false);
    // Only the surviving destination carries a parseable origin; the overwritten
    // intermediate rows do not.
    expect(movedUpFromClassIdByEntryId.get('dest-excellent')).toBe('class-advanced');
    expect(movedUpFromClassIdByEntryId.has('src-novice')).toBe(false);
    expect(movedUpFromClassIdByEntryId.has('src-advanced')).toBe(false);
  });

  it('returns empty resolution when there are no move-ups', () => {
    const { suppressedEntryIds, movedUpFromClassIdByEntryId } = resolveMoveUpDisplay([
      { id: 'e1', dogId: 'dog-1', classId: 'class-novice', status: 'confirmed' },
    ]);
    expect(suppressedEntryIds.size).toBe(0);
    expect(movedUpFromClassIdByEntryId.size).toBe(0);
  });
});
