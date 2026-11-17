import { describe, expect, it } from 'vitest';

import { buildArmbandPaperworkDescriptor } from '@/features/show-map/cockpit/paperworkPrintState';
import { selectArmbandLabelEntries } from '../armbandLabelData';
import {
  choiceForEntry,
  entriesForChoice,
  lastLabelPrintedAt,
  listLabelDays,
  listLabelDogs,
  withoutPrintedLabels,
} from '../armbandLabelChoice';
import { buildPrintedLabelIndex, type ArmbandPrintRecordLike } from '../armbandPrintIndex';
import type { ArmbandLabelEntry } from '../armbandLabelTypes';

const SHOW = { kind: 'show' as const, showId: 'show-1' };

function entry(id: string, over: Partial<ArmbandLabelEntry>): ArmbandLabelEntry {
  return {
    id,
    dogId: 'dog-1',
    trialId: 'trial-1',
    classId: 'class-1',
    calendarDay: '2026-12-07',
    armband: 101,
    callName: 'Juni',
    breed: 'Beagle',
    handler: 'Jane',
    trialDate: '12/7/2026',
    isDayOfShow: false,
    ...over,
  };
}

// Juni is in two trials on Monday and in one on Tuesday; Hazel is only in Monday's first trial.
const juniMonTrial1 = entry('e1', {});
const juniMonTrial2 = entry('e2', { trialId: 'trial-2', classId: 'class-2' });
const juniTue = entry('e3', { trialId: 'trial-3', classId: 'class-3', calendarDay: '2026-12-08' });
const hazelMon = entry('e4', { dogId: 'dog-2', armband: 102, callName: 'Hazel' });
const ALL = [juniMonTrial1, juniMonTrial2, juniTue, hazelMon];

function printRecord(
  labels: readonly ArmbandLabelEntry[],
  over: Partial<ArmbandPrintRecordLike> = {}
): ArmbandPrintRecordLike {
  const descriptor = buildArmbandPaperworkDescriptor(
    SHOW,
    labels.map(label => ({
      dogId: label.dogId,
      calendarDay: label.calendarDay,
      armband: label.armband,
      callName: label.callName,
      handlerName: label.handler,
    }))
  );
  return {
    reportId: 'armband-labels',
    coverage: descriptor.coverage,
    printedAt: '2026-12-07T08:00:00.000Z',
    ...over,
  };
}

describe('armband labels by day (MYK9-2073)', () => {
  it('prints one label per dog for a day, even when the dog is in two trials that day', () => {
    const day = entriesForChoice(ALL, SHOW, { day: '2026-12-07', dogKey: null });
    expect(day.map(item => item.id)).toEqual(['e1', 'e2', 'e4']);
    const labels = selectArmbandLabelEntries(day, SHOW);
    expect(labels.map(item => item.armband).sort()).toEqual([101, 102]);
  });

  it('keeps the scope the panel opened on when no day is chosen', () => {
    const trial1 = { kind: 'trial' as const, showId: 'show-1', trialId: 'trial-1' };
    expect(entriesForChoice(ALL, trial1, { day: null, dogKey: null }).map(i => i.id)).toEqual([
      'e1',
      'e4',
    ]);
  });

  it('lists the days and the dogs', () => {
    expect(listLabelDays(ALL)).toEqual(['2026-12-07', '2026-12-08']);
    expect(listLabelDogs(ALL).map(dog => dog.label)).toEqual(['#101 Juni', '#102 Hazel']);
  });
});

describe('labels added since the last print (MYK9-2073)', () => {
  const indexOf = (records: ArmbandPrintRecordLike[]) => buildPrintedLabelIndex(records);

  it('prints only the dogs whose label was not in that day last print', () => {
    const mondayPrint = printRecord([juniMonTrial1, hazelMon]);
    const lateEntry = entry('e5', { dogId: 'dog-3', armband: 103, callName: 'Moss' });
    const monday = selectArmbandLabelEntries(
      entriesForChoice([...ALL, lateEntry], SHOW, { day: '2026-12-07', dogKey: null }),
      SHOW
    );
    const added = withoutPrintedLabels(monday, indexOf([mondayPrint]));
    expect(added.map(item => item.callName)).toEqual(['Moss']);
    // Tuesday's label for Juni was never printed: Monday's print does not cover it.
    expect(withoutPrintedLabels([juniTue], indexOf([mondayPrint])).map(item => item.id)).toEqual([
      'e3',
    ]);
  });

  it('prints a label again when it changed after printing', () => {
    const mondayPrint = printRecord([juniMonTrial1, hazelMon]);
    const renumbered = { ...juniMonTrial1, armband: 150 };
    const renamed = { ...hazelMon, handler: 'New Handler' };
    expect(
      withoutPrintedLabels([renumbered, renamed], indexOf([mondayPrint])).map(item => item.id)
    ).toEqual(['e1', 'e4']);
  });

  it('does not reprint a dog because it moved to another class', () => {
    const mondayPrint = printRecord([juniMonTrial1]);
    expect(withoutPrintedLabels([juniMonTrial2], indexOf([mondayPrint]))).toHaveLength(0);
  });

  it('counts a print the secretary undid as not printed', () => {
    const undone = printRecord([juniMonTrial1], { voidedAt: '2026-12-07T09:00:00.000Z' });
    expect(withoutPrintedLabels([juniMonTrial1], indexOf([undone]))).toHaveLength(1);
  });

  it('ignores prints of other sheets', () => {
    const other = { ...printRecord([juniMonTrial1]), reportId: 'check-in-sheet' };
    expect(indexOf([other]).size).toBe(0);
  });

  it('says when a label last printed in its current form', () => {
    const records = [
      printRecord([juniMonTrial1]),
      printRecord([juniMonTrial1], { printedAt: '2026-12-07T10:00:00.000Z' }),
    ];
    expect(lastLabelPrintedAt(indexOf(records), juniMonTrial1)).toBe('2026-12-07T10:00:00.000Z');
    expect(lastLabelPrintedAt(indexOf(records), hazelMon)).toBeNull();
    // A renumbered label is not the one that printed.
    expect(lastLabelPrintedAt(indexOf(records), { ...juniMonTrial1, armband: 150 })).toBeNull();
  });
});

describe('one dog label (MYK9-2073)', () => {
  it('opens on the row entry dog and day, and prints only that dog for that day', () => {
    const choice = choiceForEntry(ALL, 'e2');
    expect(choice).toEqual({ day: '2026-12-07', dogKey: 'dog-1', addedOnly: false });
    if (!choice) throw new Error('expected a preset choice');
    const dog = entriesForChoice(ALL, SHOW, choice);
    expect(selectArmbandLabelEntries(dog, SHOW).map(item => item.armband)).toEqual([101]);
  });

  it('has no preset for an unknown entry', () => {
    expect(choiceForEntry(ALL, 'nope')).toBeNull();
    expect(choiceForEntry(ALL, undefined)).toBeNull();
  });
});
