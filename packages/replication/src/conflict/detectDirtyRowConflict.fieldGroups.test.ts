import { describe, expect, it } from 'vitest';
import { mergeNonConflictingServerFields } from './detectDirtyRowConflict';

// MYK9-1327: a class's judge is one value held across several fields.
const JUDGE_GROUP = { fieldGroups: [['judgeId', 'judgeName', 'judgeLastName']] };

describe('mergeNonConflictingServerFields fieldGroups (MYK9-1327)', () => {
  it('keeps a changed group whole, even a member that equals the base', () => {
    const result = mergeNonConflictingServerFields({
      base: { id: '1', judgeId: 'a', judgeName: 'Ann Judge', judgeLastName: 'Judge', room: 1 },
      // The new judge shares the old one's last name, so that member equals the base.
      local: { id: '1', judgeId: 'c', judgeName: 'Cy Judge', judgeLastName: 'Judge', room: 1 },
      remote: { id: '1', judgeId: 'a', judgeName: undefined, judgeLastName: undefined, room: 2 },
      comparePolicy: JUDGE_GROUP,
    });

    expect(result.merged).toEqual({
      id: '1',
      judgeId: 'c',
      judgeName: 'Cy Judge',
      judgeLastName: 'Judge',
      room: 2,
    });
    expect(result.appliedFields).toEqual(['room']);
  });

  it('still adopts the whole group from the server when the device changed none of it', () => {
    const result = mergeNonConflictingServerFields({
      base: { id: '1', judgeId: 'a', judgeName: 'Ann Judge', judgeLastName: 'Judge', room: 1 },
      local: { id: '1', judgeId: 'a', judgeName: 'Ann Judge', judgeLastName: 'Judge', room: 3 },
      remote: { id: '1', judgeId: 'd', judgeName: 'Dee Dog', judgeLastName: 'Dog', room: 1 },
      comparePolicy: JUDGE_GROUP,
    });

    expect(result.merged).toMatchObject({ judgeId: 'd', judgeName: 'Dee Dog', room: 3 });
  });

  it('merges field by field without groups, as before', () => {
    const result = mergeNonConflictingServerFields({
      base: { id: '1', judgeId: 'a', judgeLastName: 'Judge' },
      local: { id: '1', judgeId: 'c', judgeLastName: 'Judge' },
      remote: { id: '1', judgeId: 'a', judgeLastName: undefined },
    });

    expect(result.merged).toEqual({ id: '1', judgeId: 'c', judgeLastName: undefined });
  });
});
