import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

import { buildReportPaperworkDescriptor } from '../buildReportPaperworkDescriptor';
import { CLASSES, ENTRIES } from './trialPacketFixtures';

const mocks = vi.hoisted(() => ({ recordPaperworkPrinted: vi.fn() }));
vi.mock('../paperworkPrintActions', () => ({
  recordPaperworkPrinted: mocks.recordPaperworkPrinted,
}));

import { recordTrialPacketPrint } from './recordTrialPacketPrint';

const USER = { id: 'user-1' } as User;
const CLASS_IDS = ['c-interior', 'c-container', 'c-exterior', 'c-buried'];

function run(classIds = CLASS_IDS) {
  return recordTrialPacketPrint({
    showId: 'show-1',
    trialId: 'trial-1',
    classIds,
    classes: CLASSES,
    entries: ENTRIES,
    user: USER,
  });
}

describe('recordTrialPacketPrint', () => {
  beforeEach(() => {
    mocks.recordPaperworkPrinted.mockReset();
    let next = 0;
    mocks.recordPaperworkPrinted.mockImplementation(async () => ({ id: `record-${++next}` }));
  });

  it('writes the check-in and score sheet record for every class, at class scope', async () => {
    const result = await run();
    expect(result.classCount).toBe(4);
    expect(result.recordIds).toHaveLength(8);
    for (const classId of CLASS_IDS) {
      for (const reportId of ['check-in-sheet', 'scoresheet']) {
        const scope = { kind: 'class', showId: 'show-1', trialId: 'trial-1', classId } as const;
        const expected = buildReportPaperworkDescriptor({
          reportId,
          scope,
          classes: CLASSES,
          entries: ENTRIES,
        });
        expect(mocks.recordPaperworkPrinted).toHaveBeenCalledWith(
          expect.objectContaining({ descriptor: expected, user: USER })
        );
      }
    }
  });

  it('records nothing for a class with no dogs', async () => {
    const result = await run(['c-empty', 'c-container']);
    expect(result.classCount).toBe(1);
    expect(result.recordIds).toHaveLength(2);
    expect(mocks.recordPaperworkPrinted).toHaveBeenCalledTimes(2);
  });

  it('keeps going when one class cannot be recorded, and names it', async () => {
    mocks.recordPaperworkPrinted.mockRejectedValueOnce(new Error('offline'));
    const result = await run(['c-interior', 'c-container']);
    expect(result.failedClassIds).toEqual(['c-interior']);
    expect(result.classCount).toBe(1);
  });
});
