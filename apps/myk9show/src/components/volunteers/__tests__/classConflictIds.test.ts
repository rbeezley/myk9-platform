import { classConflictIds } from '../classConflictIds';

describe('classConflictIds', () => {
  it('names the volunteers who handle a dog in this class only', () => {
    const conflicts = new Map([
      ['vol-1', new Set(['class-1', 'class-2'])],
      ['vol-2', new Set(['class-2'])],
    ]);
    expect(classConflictIds(conflicts, 'class-1')).toEqual(new Set(['vol-1']));
    expect(classConflictIds(conflicts, 'class-3')).toEqual(new Set());
  });
});
