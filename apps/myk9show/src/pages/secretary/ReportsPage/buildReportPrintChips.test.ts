import { describe, expect, it } from 'vitest';

import { printedSheetRowsOf } from '@/test/fixtures/printedSheetRows';
import { buildReportPaperworkDescriptor } from '@/features/show-map/cockpit/buildReportPaperworkDescriptor';
import type { PaperworkPrintEvidence } from '@/features/show-map/cockpit/paperworkPrintState';
import type { ReportScope } from '@/lib/reports/types';
import type { DbClass, DbEntry } from '@/types/database-mappings';
import type { ShowJudgeAssignment } from '@/types/judge-types';

import { buildReportPrintChips } from './buildReportPrintChips';

// MYK9-2116: after a print, the report-card chip and the selected report agree for a judge known
// only through the show's assignedJudges.
const scope = {
  kind: 'class',
  showId: 'show-1',
  trialId: 'trial-1',
  classId: 'class-1',
} as ReportScope;
const classes = [
  { id: 'class-1', trial_id: 'trial-1', element: 'Container', level: 'Novice' },
] as unknown as DbClass[];
const entries = [
  {
    id: 'e1',
    class_id: 'class-1',
    dog_id: 'd1',
    armband: '101',
    run_order: 1,
    check_in_status: 'no-status',
    entry_status: 'confirmed',
  },
] as unknown as DbEntry[];
const assignedJudges = [
  { judgeId: 'j1', judgeName: 'Ada Assigned', assignedClasses: ['class-1'] },
] as unknown as ShowJudgeAssignment[];

describe('buildReportPrintChips with a judge known only via assignedJudges', () => {
  const printed = buildReportPaperworkDescriptor({
    reportId: 'check-in-sheet',
    scope,
    classes,
    entries,
    assignedJudges,
    printedSheets: printedSheetRowsOf(classes, entries),
  })!;
  const records = [
    {
      id: 'r1',
      reportId: 'check-in-sheet',
      scopeKind: 'class',
      coverage: printed.coverage,
      fingerprint: printed.fingerprint,
      printedAt: '2026-12-07T08:00:00Z',
      printedByName: 'Jannie',
    },
  ] as unknown as PaperworkPrintEvidence[];

  it('the chip reads printed, as the selected report does', () => {
    const chips = buildReportPrintChips({
      rowsReady: true,
      records,
      scope,
      classes,
      entries,
      trials: printedSheetRowsOf(classes, entries).trials,
      assignedJudges,
    });
    expect(chips['check-in-sheet']?.tone).toBe('done');
  });

  it('a chip built without the assignments would read changed (why they are required)', () => {
    const chips = buildReportPrintChips({
      rowsReady: true,
      records,
      scope,
      classes,
      entries,
      trials: printedSheetRowsOf(classes, entries).trials,
      assignedJudges: [],
    });
    expect(chips['check-in-sheet']?.label).toBe('Changed since printed');
  });
});
