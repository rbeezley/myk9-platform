import { describe, expect, it } from 'vitest';
import { loadEntryFixture, LOAD_CLASS_IDS } from './loadFixture';

describe('load fixture mapping', () => {
  it('maps the deterministic entry range across eight classes and 63 dogs', () => {
    expect(loadEntryFixture(1)).toEqual({
      entryId: 'a1090000-0000-0000-0002-000000000001',
      classId: LOAD_CLASS_IDS[0],
      dogNumber: 1,
      armband: 2001,
    });
    expect(loadEntryFixture(8).classId).toBe(LOAD_CLASS_IDS[7]);
    expect(loadEntryFixture(9).dogNumber).toBe(2);
    expect(loadEntryFixture(504)).toEqual({
      entryId: 'a1090000-0000-0000-0002-000000000504',
      classId: LOAD_CLASS_IDS[7],
      dogNumber: 63,
      armband: 2063,
    });
  });

  it.each([0, 505, 1.5])('rejects an invalid entry number: %s', entryNumber => {
    expect(() => loadEntryFixture(entryNumber)).toThrow(/between 1 and 504/);
  });
});
