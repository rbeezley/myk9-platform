import { describe, it, expect } from 'vitest';
import { describeSavedTime, toSavedScore } from './savedScore';

const routes = { listPath: '/at-show/s/class/c', scoreRoute: '/at-show/s/class/c/score/e' };

describe('describeSavedTime', () => {
  it.each([
    ['00:04.35', '0:04.35'],
    ['0:04.35', '0:04.35'],
    ['01:12.50', '1:12.50'],
    ['10:00.00', '10:00.00'],
    ['4.35', '0:04.35'],
    ['65', '1:05.00'],
  ])('shows %s as %s', (raw, shown) => {
    expect(describeSavedTime(raw)).toBe(shown);
  });

  it.each([undefined, '', '0.00', '00:00.00', '0:00', 'abc'])('has no time for %s', raw => {
    expect(describeSavedTime(raw)).toBeNull();
  });
});

describe('toSavedScore', () => {
  const base = { entryId: 'e', armband: 100, callName: 'Willow' };

  it('names the dog, the result in words and the time', () => {
    expect(
      toSavedScore({ ...base, scoreData: { resultText: 'Q', searchTime: '00:04.35' } }, routes)
    ).toEqual({
      entryId: 'e',
      dogLabel: '100 Willow',
      resultLabel: 'Qualified',
      timeLabel: '0:04.35',
      ...routes,
    });
  });

  it('adds the UKC element time when the sheet recorded one (MYK9-2068)', () => {
    const saved = toSavedScore(
      {
        ...base,
        scoreData: { resultText: 'Q', searchTime: '00:04.35', element: '00:09.10' },
      },
      routes
    );
    expect(saved.elementLabel).toBe('0:09.10');
  });

  it.each([
    ['NQ', 'Not qualified'],
    ['EX', 'Excused'],
    ['DQ', 'Disqualified'],
    ['ABS', 'Absent'],
  ])('reads %s as %s', (code, label) => {
    const saved = toSavedScore(
      { ...base, scoreData: { resultText: code, searchTime: '' } },
      routes
    );
    expect(saved.resultLabel).toBe(label);
    expect(saved.timeLabel).toBeNull();
  });

  it('keeps a result it has no word for, rather than hiding it', () => {
    expect(
      toSavedScore({ ...base, scoreData: { resultText: '1st', searchTime: '' } }, routes)
        .resultLabel
    ).toBe('1st');
  });

  it('still names a dog with no armband or call name', () => {
    expect(
      toSavedScore(
        {
          entryId: 'e',
          armband: null,
          callName: '',
          scoreData: { resultText: 'Q', searchTime: '' },
        },
        routes
      ).dogLabel
    ).toBe('This dog');
  });
});
