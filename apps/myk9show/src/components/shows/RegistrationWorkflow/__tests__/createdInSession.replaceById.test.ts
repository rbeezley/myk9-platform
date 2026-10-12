import { describe, expect, it } from 'vitest';
import { addById, replaceById } from '../createdInSession';

describe('replaceById', () => {
  const list = [
    { id: 'a', name: 'Ziggy' },
    { id: 'b', name: 'Maple' },
  ];

  it('renames the record with that id in place and keeps the order', () => {
    expect(replaceById(list, { id: 'a', name: 'Ziggy Zoom' })).toEqual([
      { id: 'a', name: 'Ziggy Zoom' },
      { id: 'b', name: 'Maple' },
    ]);
  });

  it('never adds a record the list does not hold, so an edit is not "created here"', () => {
    expect(replaceById(list, { id: 'c', name: 'Cracker' })).toBe(list);
  });

  it('addById stays first-write-wins, so a re-report cannot rename what replaceById owns', () => {
    expect(addById(list, { id: 'a', name: 'Renamed' })).toBe(list);
  });
});
