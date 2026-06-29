import { describe, it, expect } from 'vitest';
import { autoAssignHandlers, type HandlerCandidateDog } from './autoAssignHandlers';
import {
  makeHandlerKey,
  type ClassSelectionData,
  type HandlerInfo,
} from '@/types/show-registration-types';

const dogs: HandlerCandidateDog[] = [
  { id: 'dog-1', ownerId: 'owner-1', ownerName: 'Pat Owner' },
  { id: 'dog-2', ownerId: 'owner-2', ownerName: undefined },
  // Orphan dog: no owner on file.
  { id: 'dog-3', ownerId: '' as unknown as string, ownerName: 'No Owner' },
];

const selections: ClassSelectionData[] = [
  { dogId: 'dog-1', trialId: 't-1', selectedClasses: [{ classId: 'class-a' }, { classId: 'class-b' }] },
  { dogId: 'dog-2', trialId: 't-1', selectedClasses: [{ classId: 'class-a' }] },
];

describe('autoAssignHandlers', () => {
  it('assigns the dog owner as handler for every selected class', () => {
    const result = autoAssignHandlers({}, selections, dogs);
    expect(result[makeHandlerKey('dog-1', 'class-a')]).toEqual({
      handlerId: 'owner-1',
      handlerName: 'Pat Owner',
      isOwner: true,
    });
    expect(result[makeHandlerKey('dog-1', 'class-b')]).toEqual({
      handlerId: 'owner-1',
      handlerName: 'Pat Owner',
      isOwner: true,
    });
  });

  it('falls back to "Owner" when the dog has no owner name', () => {
    const result = autoAssignHandlers({}, selections, dogs);
    expect(result[makeHandlerKey('dog-2', 'class-a')]).toEqual({
      handlerId: 'owner-2',
      handlerName: 'Owner',
      isOwner: true,
    });
  });

  it('skips dogs that have no owner on file', () => {
    const orphanSelection: ClassSelectionData[] = [
      { dogId: 'dog-3', trialId: 't-1', selectedClasses: [{ classId: 'class-a' }] },
    ];
    const result = autoAssignHandlers({}, orphanSelection, dogs);
    expect(result[makeHandlerKey('dog-3', 'class-a')]).toBeUndefined();
  });

  it('never clobbers an existing (manual) handler assignment', () => {
    const manual: Record<string, HandlerInfo> = {
      [makeHandlerKey('dog-1', 'class-a')]: {
        handlerId: 'hired-gun',
        handlerName: 'Pro Handler',
        isOwner: false,
      },
    };
    const result = autoAssignHandlers(manual, selections, dogs);
    expect(result[makeHandlerKey('dog-1', 'class-a')]).toEqual({
      handlerId: 'hired-gun',
      handlerName: 'Pro Handler',
      isOwner: false,
    });
    // Other entries still get auto-filled.
    expect(result[makeHandlerKey('dog-1', 'class-b')]?.handlerId).toBe('owner-1');
  });

  it('returns the SAME reference when nothing new is assigned (render no-op)', () => {
    const already = autoAssignHandlers({}, selections, dogs);
    const second = autoAssignHandlers(already, selections, dogs);
    expect(second).toBe(already);
  });

  it('returns the same reference for an empty selection set', () => {
    const prev: Record<string, HandlerInfo> = {};
    expect(autoAssignHandlers(prev, [], dogs)).toBe(prev);
  });
});
