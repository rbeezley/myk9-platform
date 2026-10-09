/**
 * One rule for "is the judge's day over", shared by the Overview tree and the Results tab
 * (judgeDayStatus.ts). The cases mirror judgeDaySignOff.test.ts, which drives the same rule
 * through buildShowMapTree.
 */
import { describe, expect, it } from 'vitest';

import { classifyJudgeDays } from '../judgeDayStatus';
import type { ShowMapClassInput, ShowMapEntryInput } from '../showMapTypes';

const dates = new Map([['t1', '2026-10-10']]);
const cls = (id: string, extra: Partial<ShowMapClassInput> = {}): ShowMapClassInput => ({
  id,
  trialId: 't1',
  name: id,
  judgeId: 'j1',
  judgeName: 'Pat',
  status: 'Completed',
  ...extra,
});
const noEntries = new Map<string, ShowMapEntryInput[]>();

describe('classifyJudgeDays', () => {
  it('keys a judge and a date together, and closes the day when every class finished', () => {
    const result = classifyJudgeDays([cls('c1'), cls('c2')], noEntries, dates);
    expect(result.byClassId.get('c1')?.dayKey).toBe(result.byClassId.get('c2')?.dayKey);
    expect(result.openDayKeys.size).toBe(0);
  });

  it('keeps the day open while a class is still running', () => {
    const result = classifyJudgeDays(
      [cls('c1'), cls('c2', { status: 'In Progress' })],
      noEntries,
      dates
    );
    expect(result.byClassId.get('c2')?.finished).toBe(false);
    expect(result.openDayKeys.has(result.byClassId.get('c1')!.dayKey)).toBe(true);
  });

  it('a class holding only entries waiting on acceptance is not empty: the day stays open', () => {
    const pendingOnly = cls('c2', {
      status: 'Scheduled',
      entryCount: 0,
      scoredCount: 0,
      runListCount: 1,
    });
    const result = classifyJudgeDays([cls('c1'), pendingOnly], noEntries, dates);
    expect(result.byClassId.get('c2')?.finished).toBe(false);
    expect(result.openDayKeys.size).toBe(1);
  });

  it('a class KNOWN to have nothing to run does not hold the day open', () => {
    const empty = cls('c2', {
      status: 'Scheduled',
      entryCount: 0,
      scoredCount: 0,
      runListCount: 0,
    });
    const result = classifyJudgeDays([cls('c1'), empty], noEntries, dates);
    expect(result.byClassId.get('c2')?.finished).toBe(true);
    expect(result.openDayKeys.size).toBe(0);
  });

  it('a cancelled class never holds the day open', () => {
    const result = classifyJudgeDays(
      [cls('c1'), cls('c2', { status: 'Cancelled' })],
      noEntries,
      dates
    );
    expect(result.openDayKeys.size).toBe(0);
  });
});
