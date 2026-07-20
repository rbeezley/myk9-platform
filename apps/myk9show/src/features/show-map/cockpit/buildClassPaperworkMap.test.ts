import { describe, expect, it } from 'vitest';

import { buildClassPaperworkMap } from './buildClassPaperworkMap';
import { buildReportPaperworkDescriptor } from './buildReportPaperworkDescriptor';
import type { DbClass, DbEntry } from '@/types/database-mappings';

const classes = [{ id: 'class-1', trial_id: 'trial-1' }] as DbClass[];
const entries = [
  {
    id: 'entry-1',
    class_id: 'class-1',
    dog_id: 'dog-1',
    armband: '101',
    run_order: 1,
    check_in_status: null,
  },
] as DbEntry[];

describe('buildClassPaperworkMap', () => {
  it('shows the actor and timestamp for a covering confirmed print', () => {
    const scope = {
      kind: 'class' as const,
      showId: 'show-1',
      trialId: 'trial-1',
      classId: 'class-1',
    };
    const descriptor = buildReportPaperworkDescriptor({
      reportId: 'check-in-sheet',
      scope,
      classes,
      entries,
    });
    expect(descriptor).not.toBeNull();
    const map = buildClassPaperworkMap({
      showId: 'show-1',
      classes,
      entries,
      records: [
        {
          id: 'print-1',
          showId: 'show-1',
          trialId: 'trial-1',
          classId: 'class-1',
          scopeKind: 'class',
          reportId: 'check-in-sheet',
          coverage: descriptor!.coverage,
          fingerprint: descriptor!.fingerprint,
          printedBy: 'user-1',
          printedByName: 'Jannie',
          printedAt: '2026-07-20T14:42:00.000Z',
        },
      ],
      returnTo: '/shows/show-1/show-desk',
    });

    expect(map.get('class-1')?.find(item => item.reportId === 'check-in-sheet')).toMatchObject({
      state: 'current',
      printedBy: 'Jannie',
      printedAt: '2026-07-20T14:42:00.000Z',
      coveredByScope: 'class',
      confirmation: {
        scope: { kind: 'class', showId: 'show-1', trialId: 'trial-1', classId: 'class-1' },
      },
    });
  });

  it('suppresses every print action for a zero-entry Class', () => {
    const map = buildClassPaperworkMap({
      showId: 'show-1',
      classes,
      entries: [],
      records: [],
      returnTo: '/shows/show-1/show-desk',
    });

    expect(map.get('class-1')).toEqual([]);
  });
});
