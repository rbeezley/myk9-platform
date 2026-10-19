import { armbandInSelection, parseArmbandSelection, printRangesFor } from '../armbandSelection';

describe('parseArmbandSelection (like a print dialog page range)', () => {
  it('reads one number', () => {
    expect(parseArmbandSelection('101')).toEqual({ ranges: [[101, 101]] });
  });

  it('reads numbers separated by commas, with or without spaces', () => {
    expect(parseArmbandSelection('101,105 , 110')).toEqual({
      ranges: [
        [101, 101],
        [105, 105],
        [110, 110],
      ],
    });
  });

  it('reads ranges, including spaced and en-dash ranges', () => {
    expect(parseArmbandSelection('101-105, 110 - 112, 120–121')).toEqual({
      ranges: [
        [101, 105],
        [110, 112],
        [120, 121],
      ],
    });
  });

  it('reads a backwards range as the same range', () => {
    expect(parseArmbandSelection('110-105')).toEqual({ ranges: [[105, 110]] });
  });

  it('ignores empty pieces from stray commas', () => {
    expect(parseArmbandSelection(' 101,, 102, ')).toEqual({
      ranges: [
        [101, 101],
        [102, 102],
      ],
    });
  });

  it('is no selection at all when blank', () => {
    expect(parseArmbandSelection('   ')).toEqual({ ranges: [] });
  });

  it('names the piece it cannot read', () => {
    expect(parseArmbandSelection('101, abc, 105')).toEqual({ invalid: 'abc' });
    expect(parseArmbandSelection('101-')).toEqual({ invalid: '101-' });
    expect(parseArmbandSelection('1-2-3')).toEqual({ invalid: '1-2-3' });
    expect(parseArmbandSelection('0')).toEqual({ invalid: '0' });
  });
});

describe('printRangesFor', () => {
  it('limits nothing when blank, prints nothing for unreadable text', () => {
    expect(printRangesFor('  ')).toBeNull();
    expect(printRangesFor('101, abc')).toEqual([]);
    expect(printRangesFor('101-102')).toEqual([[101, 102]]);
  });
});

describe('armbandInSelection', () => {
  const ranges = [
    [101, 101],
    [105, 110],
  ] as const;

  it('matches a listed number and anything inside a range, ends included', () => {
    expect(armbandInSelection(101, ranges)).toBe(true);
    expect(armbandInSelection(105, ranges)).toBe(true);
    expect(armbandInSelection(108, ranges)).toBe(true);
    expect(armbandInSelection(110, ranges)).toBe(true);
  });

  it('does not match anything else', () => {
    expect(armbandInSelection(102, ranges)).toBe(false);
    expect(armbandInSelection(111, ranges)).toBe(false);
  });
});
