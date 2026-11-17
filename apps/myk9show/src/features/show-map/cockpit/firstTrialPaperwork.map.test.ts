import { describe, expect, it } from 'vitest';

import type { DbClass, DbEntry } from '@/types/database-mappings';
import type { ReplicatedPaperworkPrint } from '@/services/replication';

import { buildClassPaperworkMap } from './buildClassPaperworkMap';
import { firstTrialLineText } from './firstTrialLineText';
import { rollUpFirstDayPaperwork } from './firstTrialPaperwork';
import { buildArmbandPaperworkDescriptor } from './paperworkPrintState';

/**
 * The line's last hop (MYK9-2075): the real `buildClassPaperworkMap` output, rolled up and worded.
 * Day 1 holds trial-1 (classes a, b) and trial-2 (class c); day 2 holds trial-3 (class d).
 */
const DAY = '2026-12-07';
const trials = [
  { id: 'trial-1', trialDate: DAY, trialNumber: '1' },
  { id: 'trial-2', trialDate: DAY, trialNumber: '2' },
  { id: 'trial-3', trialDate: '2026-12-08', trialNumber: '1' },
];
const classRows = [
  { id: 'a', trial_id: 'trial-1' },
  { id: 'b', trial_id: 'trial-1' },
  { id: 'c', trial_id: 'trial-2' },
  { id: 'd', trial_id: 'trial-3' },
] as DbClass[];
const classes = [
  { id: 'a', trialId: 'trial-1', element: 'Interior', level: 'Advanced', judgeName: 'Ann' },
  { id: 'b', trialId: 'trial-1', element: 'Container', level: 'Novice', judgeName: ' ann ' },
  { id: 'c', trialId: 'trial-2', element: 'Buried', level: 'Novice', judgeName: 'Bo' },
  { id: 'd', trialId: 'trial-3', element: 'Exterior', level: 'Novice', judgeName: 'Cy' },
];

function entry(
  id: string,
  classId: string,
  dogId: string,
  armband: string | null,
  status = 'confirmed'
) {
  return {
    id,
    class_id: classId,
    dog_id: dogId,
    armband,
    entry_status: status,
    run_order: 1,
    dog: { call_name: dogId, owner: { first_name: 'Jamie', last_name: 'Walker' } },
  } as unknown as DbEntry;
}

function labelPrint(printedAt: string, dogs: { dogId: string; armband: number }[]) {
  const descriptor = buildArmbandPaperworkDescriptor(
    { kind: 'show', showId: 'show-1' },
    dogs.map(dog => ({
      dogId: dog.dogId,
      calendarDay: DAY,
      armband: dog.armband,
      callName: dog.dogId,
      handlerName: 'Jamie Walker',
      classIds: ['a'],
      trialIds: ['trial-1'],
    }))
  );
  return {
    id: `p-${printedAt}`,
    showId: 'show-1',
    scopeKind: 'show',
    reportId: 'armband-labels',
    coverage: descriptor.coverage,
    fingerprint: descriptor.fingerprint,
    printedBy: 'u1',
    printedByName: 'Jannie',
    printedAt,
  } as unknown as ReplicatedPaperworkPrint;
}

function line(
  entries: DbEntry[],
  records: ReplicatedPaperworkPrint[],
  recordsUnavailable = false,
  rollUpClasses: typeof classes = classes
) {
  const byClassId = buildClassPaperworkMap({
    assignedJudges: [],
    showId: 'show-1',
    classes: classRows,
    trials,
    entries,
    records,
    recordsUnavailable,
    returnTo: '/x',
  });
  const paperwork = rollUpFirstDayPaperwork({
    trials,
    classes: rollUpClasses,
    byClassId,
    available: true,
  });
  return { paperwork, text: firstTrialLineText(paperwork) };
}

describe('the first-day label count, from the real paperwork map', () => {
  // juni is in two classes of the day: one label. Pending, no-armband and deleted dogs have none.
  const entries = [
    entry('e1', 'a', 'juni', '101'),
    entry('e2', 'a', 'hazel', '102'),
    entry('e3', 'b', 'juni', '101'),
    entry('e4', 'c', 'moss', '103'),
    entry('e5', 'c', 'pending-dog', '104', 'pending'),
    entry('e6', 'c', 'no-number', null),
    entry('e7', 'd', 'next-day', '201'),
  ];

  it('counts distinct dogs on the first day, across trials, not classes', () => {
    const { paperwork } = line(entries, []);
    expect(paperwork.labelsNotPrinted).toBe(3);
    expect(paperwork.labelsChanged).toBe(0);
  });

  it('counts only the late entry once the rest are printed', () => {
    const printed = labelPrint('2026-12-06T22:00:00Z', [
      { dogId: 'juni', armband: 101 },
      { dogId: 'hazel', armband: 102 },
    ]);
    const { paperwork } = line(entries, [printed]);
    expect(paperwork.labelsNotPrinted).toBe(1);
    expect(paperwork.labelDoorClassId).toBe('c');
  });

  it('leaves out a dog held for a registration number, which the label print never prints', () => {
    const held = {
      ...entry('e8', 'b', 'held-dog', '105'),
      awaiting_registration_number: true,
    } as unknown as DbEntry;
    const { paperwork } = line([...entries, held], []);
    expect(paperwork.labelsNotPrinted).toBe(3);
  });

  it('does not measure a cancelled class, so its dogs and sheets never hold the line open', () => {
    const cancelledC = classes.map(item =>
      item.id === 'c' ? { ...item, status: 'cancelled' } : item
    );
    const { paperwork } = line(entries, [], false, cancelledC);
    expect(paperwork.labelsNotPrinted).toBe(2);
  });

  it('is unknown, with no guess, when the print history cannot be read', () => {
    const { paperwork, text } = line(entries, [], true);
    expect(paperwork.status).toBe('unknown');
    expect(text.detail).toBe("Can't check right now");
    expect(text.linkLabel).toBeUndefined();
  });
});
