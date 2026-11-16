import { describe, expect, it } from 'vitest';

import { sheetPrintIsCurrent } from '../../../../../../supabase/functions/_shared/paperwork/printState.ts';
import { buildSheetDescriptorFromRows } from '../../../../../../supabase/functions/_shared/paperwork/rowDescriptors.ts';
import type {
  PaperworkClassRow,
  PaperworkEntryRow,
} from '../../../../../../supabase/functions/_shared/paperwork/rowDescriptors.ts';
import type { PaperworkScope } from '../../../../../../supabase/functions/_shared/paperwork/descriptor.ts';
import { derivePaperworkPrintState, type PaperworkPrintEvidence } from './paperworkPrintState';

// MYK9-2086 part B. The reminder's `sheetPrintIsCurrent` is a server copy of the app's
// `derivePaperworkPrintState` for the two paper sheets. Both run on the same fixtures here, so a
// change to one that the other does not follow fails this file instead of silently making the
// reminder disagree with the class card.

const SHOW_ID = 'show-1';
const TRIAL_ID = 'trial-1';
const CLASS_ID = 'class-1';

const classes: PaperworkClassRow[] = [
  {
    id: CLASS_ID,
    trial_id: TRIAL_ID,
    element: 'Container',
    level: 'Novice',
    section: 'A',
    status: 'scheduled',
    time_limit_seconds: 180,
    num_areas: 1,
  },
  { id: 'class-2', trial_id: TRIAL_ID, element: 'Interior', level: 'Novice', section: 'A' },
];
const entries: PaperworkEntryRow[] = [
  { id: 'e1', class_id: CLASS_ID, dog_id: 'd1', armband: 101, run_order: 1 },
  { id: 'e2', class_id: 'class-2', dog_id: 'd2', armband: 102, run_order: 1 },
];
const changedEntries: PaperworkEntryRow[] = [
  entries[0]!,
  { id: 'e3', class_id: CLASS_ID, dog_id: 'd3', armband: 103, run_order: 2 },
  entries[1]!,
];

const classScope: PaperworkScope = {
  kind: 'class',
  showId: SHOW_ID,
  trialId: TRIAL_ID,
  classId: CLASS_ID,
};
const trialScope: PaperworkScope = { kind: 'trial', showId: SHOW_ID, trialId: TRIAL_ID };
const showScope: PaperworkScope = { kind: 'show', showId: SHOW_ID };

interface Fixture {
  scope: PaperworkScope;
  rows: readonly PaperworkEntryRow[];
  printedAt: string;
  voided?: boolean;
}

function descriptorFor(
  reportId: string,
  scope: PaperworkScope,
  rows: readonly PaperworkEntryRow[]
) {
  const descriptor = buildSheetDescriptorFromRows({ reportId, scope, classes, entries: rows });
  if (!descriptor) throw new Error('fixture scope has no entries');
  return descriptor;
}

/** Both copies, on one set of records, against the class's descriptor built from `now`. */
function bothAgree(
  reportId: 'check-in-sheet' | 'scoresheet',
  prints: readonly Fixture[],
  now: readonly PaperworkEntryRow[] = entries
) {
  const appRecords: PaperworkPrintEvidence[] = prints.map((print, index) => {
    const descriptor = descriptorFor(reportId, print.scope, print.rows);
    return {
      id: `p${index}`,
      reportId,
      coverage: descriptor.coverage as unknown as Record<string, unknown>,
      fingerprint: descriptor.fingerprint,
      printedAt: print.printedAt,
      printedByName: 'Sec',
      ...(print.voided ? { voidedAt: '2026-10-03T23:00:00.000Z' } : {}),
    };
  });
  const serverRows = appRecords.map(record => ({
    report_id: record.reportId,
    coverage: record.coverage,
    printed_at: record.printedAt,
    voided_at: record.voidedAt ?? null,
  }));
  const current = descriptorFor(reportId, classScope, now);
  const app = derivePaperworkPrintState(appRecords, current).state === 'current';
  const server = sheetPrintIsCurrent(serverRows, current);
  expect(server).toBe(app);
  return server;
}

const T1 = '2026-10-03T10:00:00.000Z';
const T2 = '2026-10-03T12:00:00.000Z';

describe.each(['check-in-sheet', 'scoresheet'] as const)(
  'sheetPrintIsCurrent agrees with derivePaperworkPrintState (%s)',
  reportId => {
    it("current: a class print of today's rows", () => {
      expect(bothAgree(reportId, [{ scope: classScope, rows: entries, printedAt: T1 }])).toBe(true);
    });

    it('stale: an entry was added after the print', () => {
      expect(
        bothAgree(reportId, [{ scope: classScope, rows: entries, printedAt: T1 }], changedEntries)
      ).toBe(false);
    });

    it('unconfirmed: no print at all', () => {
      expect(bothAgree(reportId, [])).toBe(false);
    });

    it('voided: a voided print does not count', () => {
      expect(
        bothAgree(reportId, [{ scope: classScope, rows: entries, printedAt: T1, voided: true }])
      ).toBe(false);
    });

    it('a newer stale print wins over an older current one', () => {
      expect(
        bothAgree(reportId, [
          { scope: classScope, rows: entries, printedAt: T1 },
          { scope: classScope, rows: changedEntries, printedAt: T2 },
        ])
      ).toBe(false);
    });

    it('a newer current print wins over an older stale one', () => {
      expect(
        bothAgree(reportId, [
          { scope: classScope, rows: changedEntries, printedAt: T1 },
          { scope: classScope, rows: entries, printedAt: T2 },
        ])
      ).toBe(true);
    });

    it('a trial-scoped print covers the class, current and stale', () => {
      expect(bothAgree(reportId, [{ scope: trialScope, rows: entries, printedAt: T1 }])).toBe(true);
      expect(
        bothAgree(reportId, [{ scope: trialScope, rows: entries, printedAt: T1 }], changedEntries)
      ).toBe(false);
    });

    it('a show-scoped print covers the class, current and stale', () => {
      expect(bothAgree(reportId, [{ scope: showScope, rows: entries, printedAt: T1 }])).toBe(true);
      expect(
        bothAgree(reportId, [{ scope: showScope, rows: entries, printedAt: T1 }], changedEntries)
      ).toBe(false);
    });

    it('a print of a different class does not cover this one', () => {
      const other: PaperworkScope = { ...classScope, classId: 'class-2' };
      expect(bothAgree(reportId, [{ scope: other, rows: entries, printedAt: T1 }])).toBe(false);
    });
  }
);
