import { describe, expect, it } from 'vitest';

import { buildClassPaperworkMap } from './buildClassPaperworkMap';
import { buildReportPaperworkDescriptor } from './buildReportPaperworkDescriptor';
import { buildArmbandPaperworkDescriptor } from './paperworkPrintState';
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
    dog: { call_name: 'Storm', owner: { first_name: 'Jamie', last_name: 'Walker' } },
  },
] as unknown as DbEntry[];

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
      trials: [{ id: 'trial-1', trialDate: '2026-07-20' }],
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
      trials: [{ id: 'trial-1', trialDate: '2026-07-20' }],
      entries: [],
      records: [],
      returnTo: '/shows/show-1/show-desk',
    });

    expect(map.get('class-1')).toEqual([]);
  });

  it('derives current and stale Armband Label evidence from Dog/day coverage', () => {
    const scope = {
      kind: 'class' as const,
      showId: 'show-1',
      trialId: 'trial-1',
      classId: 'class-1',
    };
    const descriptor = buildArmbandPaperworkDescriptor(scope, [
      {
        dogId: 'dog-1',
        calendarDay: '2026-07-20',
        armband: 101,
        callName: 'Storm',
        handlerName: 'Jamie Walker',
        classIds: ['class-1'],
        trialIds: ['trial-1'],
      },
    ]);
    const record = {
      id: 'armband-print-1',
      showId: 'show-1',
      trialId: 'trial-1',
      classId: 'class-1',
      scopeKind: 'class' as const,
      reportId: 'armband-labels',
      coverage: descriptor.coverage,
      fingerprint: descriptor.fingerprint,
      printedBy: 'user-1',
      printedByName: 'Jamie',
      printedAt: '2026-07-20T14:42:00.000Z',
    };

    const current = buildClassPaperworkMap({
      showId: 'show-1',
      classes,
      trials: [{ id: 'trial-1', trialDate: '2026-07-20' }],
      entries,
      records: [record],
      returnTo: '/shows/show-1/show-desk',
    });
    expect(current.get('class-1')?.find(item => item.reportId === 'armband-labels')).toMatchObject({
      state: 'current',
      printedAt: '2026-07-20T14:42:00.000Z',
    });

    const stale = buildClassPaperworkMap({
      showId: 'show-1',
      classes,
      trials: [{ id: 'trial-1', trialDate: '2026-07-20' }],
      entries: [{ ...entries[0], armband: '202' } as DbEntry],
      records: [record],
      returnTo: '/shows/show-1/show-desk',
    });
    expect(stale.get('class-1')?.find(item => item.reportId === 'armband-labels')).toMatchObject({
      state: 'stale',
    });
  });

  it('includes Class identity and lifecycle in result-document fingerprints', () => {
    const scope = {
      kind: 'class' as const,
      showId: 'show-1',
      trialId: 'trial-1',
      classId: 'class-1',
    };
    const scheduled = buildReportPaperworkDescriptor({
      reportId: 'result-labels',
      scope,
      classes: [
        { ...classes[0], element: 'Container', level: 'Novice', status: 'Scheduled' } as DbClass,
      ],
      entries,
    });
    const completed = buildReportPaperworkDescriptor({
      reportId: 'result-labels',
      scope,
      classes: [
        { ...classes[0], element: 'Container', level: 'Novice', status: 'Completed' } as DbClass,
      ],
      entries,
    });

    expect(scheduled?.coverage.subjectFingerprints).toHaveProperty('class:class-1');
    expect(completed?.fingerprint).not.toBe(scheduled?.fingerprint);
  });
});
