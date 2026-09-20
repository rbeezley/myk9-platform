import { describe, expect, it } from 'vitest';

import { buildClassPaperworkMap } from './buildClassPaperworkMap';
import { buildReportPaperworkDescriptor } from './buildReportPaperworkDescriptor';
import { buildArmbandPaperworkDescriptor, derivePaperworkPrintState } from './paperworkPrintState';
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
      returnTo: '/shows/show-1/show-day',
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
      returnTo: '/shows/show-1/show-day',
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
        armband: '101',
        callName: 'Storm',
        handlerName: 'Jamie Walker',
        handlerIdentity: { id: null, name: 'Jamie Walker', source: 'owner' },
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
      returnTo: '/shows/show-1/show-day',
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
      returnTo: '/shows/show-1/show-day',
    });
    expect(stale.get('class-1')?.find(item => item.reportId === 'armband-labels')).toMatchObject({
      state: 'stale',
    });
  });

  it('fingerprints the assigned handler instead of the owner for armband labels', () => {
    const assignedEntries = [
      {
        ...entries[0],
        handler: 'Alex Assigned',
        handler_id: 'handler-1',
        handler_person: { first_name: 'Joined', last_name: 'Person' },
      } as unknown as DbEntry,
    ];
    const ownerOnly = buildClassPaperworkMap({
      showId: 'show-1',
      classes,
      trials: [{ id: 'trial-1', trialDate: '2026-07-20' }],
      entries,
      records: [],
      returnTo: '/shows/show-1/show-day',
    });
    const assigned = buildClassPaperworkMap({
      showId: 'show-1',
      classes,
      trials: [{ id: 'trial-1', trialDate: '2026-07-20' }],
      entries: assignedEntries,
      records: [],
      returnTo: '/shows/show-1/show-day',
    });

    const ownerFingerprint = ownerOnly
      .get('class-1')
      ?.find(item => item.reportId === 'armband-labels')?.confirmation?.fingerprint;
    const assignedFingerprint = assigned
      .get('class-1')
      ?.find(item => item.reportId === 'armband-labels')?.confirmation?.fingerprint;

    expect(assignedFingerprint).not.toBe(ownerFingerprint);
  });

  it('keeps an unresolved assigned handler explicit in armband fingerprints', () => {
    const ownerOnly = buildClassPaperworkMap({
      showId: 'show-1',
      classes,
      trials: [{ id: 'trial-1', trialDate: '2026-07-20' }],
      entries,
      records: [],
      returnTo: '/shows/show-1/show-day',
    });
    const map = buildClassPaperworkMap({
      showId: 'show-1',
      classes,
      trials: [{ id: 'trial-1', trialDate: '2026-07-20' }],
      entries: [
        {
          ...entries[0],
          handler: null,
          handler_id: 'missing-handler',
        } as unknown as DbEntry,
      ],
      records: [],
      returnTo: '/shows/show-1/show-day',
    });

    const unresolvedFingerprint = map
      .get('class-1')
      ?.find(item => item.reportId === 'armband-labels')?.confirmation?.fingerprint;
    const ownerFingerprint = ownerOnly
      .get('class-1')
      ?.find(item => item.reportId === 'armband-labels')?.confirmation?.fingerprint;
    expect(unresolvedFingerprint).not.toBe(ownerFingerprint);
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

  it('preserves alphanumeric armbands in every entry paperwork fingerprint', () => {
    const scope = {
      kind: 'class' as const,
      showId: 'show-1',
      trialId: 'trial-1',
      classId: 'class-1',
    };
    const reportIds = ['check-in-sheet', 'scoresheet', 'results-sheet', 'result-labels'] as const;
    for (const reportId of reportIds) {
      const withFirstArmband = buildReportPaperworkDescriptor({
        reportId,
        scope,
        classes,
        entries: [{ ...entries[0], armband: '12A' } as DbEntry],
      });
      const withSecondArmband = buildReportPaperworkDescriptor({
        reportId,
        scope,
        classes,
        entries: [{ ...entries[0], armband: '12B' } as DbEntry],
      });

      expect(withFirstArmband?.fingerprint).not.toBe(withSecondArmband?.fingerprint);
    }
  });

  it('normalizes legacy zero armbands before report fingerprints', () => {
    const scope = {
      kind: 'class' as const,
      showId: 'show-1',
      trialId: 'trial-1',
      classId: 'class-1',
    };
    const zero = buildReportPaperworkDescriptor({
      reportId: 'check-in-sheet',
      scope,
      classes,
      entries: [{ ...entries[0], armband: '0' } as DbEntry],
    });
    const unassigned = buildReportPaperworkDescriptor({
      reportId: 'check-in-sheet',
      scope,
      classes,
      entries: [{ ...entries[0], armband: null } as DbEntry],
    });

    expect(zero?.fingerprint).toBe(unassigned?.fingerprint);
  });

  it('marks check-in paperwork stale when the assigned handler changes', () => {
    const scope = {
      kind: 'class' as const,
      showId: 'show-1',
      trialId: 'trial-1',
      classId: 'class-1',
    };
    const printed = buildReportPaperworkDescriptor({
      reportId: 'check-in-sheet',
      scope,
      classes,
      entries: [
        {
          ...entries[0],
          handler: 'Alex Assigned',
          handler_id: 'handler-1',
        } as unknown as DbEntry,
      ],
    });
    const current = buildReportPaperworkDescriptor({
      reportId: 'check-in-sheet',
      scope,
      classes,
      entries: [
        {
          ...entries[0],
          handler: 'Jordan Proxy',
          handler_id: 'handler-2',
        } as unknown as DbEntry,
      ],
    });

    expect(current?.fingerprint).not.toBe(printed?.fingerprint);
    expect(
      derivePaperworkPrintState(
        [
          {
            id: 'check-in-print',
            reportId: 'check-in-sheet',
            coverage: printed!.coverage as unknown as Record<string, unknown>,
            fingerprint: printed!.fingerprint,
            printedAt: '2026-07-20T14:42:00.000Z',
            printedByName: 'Jannie',
          },
        ],
        current!
      ).state
    ).toBe('stale');
  });
});
