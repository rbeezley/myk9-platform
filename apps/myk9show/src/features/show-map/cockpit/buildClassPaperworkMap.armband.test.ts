import { describe, expect, it } from 'vitest';

import { armbandLabelFingerprint } from '@/lib/labels/armbandSubjectKey';
import type { DbClass, DbEntry } from '@/types/database-mappings';
import type { ReplicatedPaperworkPrint } from '@/services/replication';

import { buildClassPaperworkMap } from './buildClassPaperworkMap';
import { buildArmbandPaperworkDescriptor } from './paperworkPrintState';

// Two classes of one trial on one day; Juni (dog-1) and Hazel (dog-2) in A, Moss (dog-3) in B.
const classes = [
  { id: 'class-a', trial_id: 'trial-1' },
  { id: 'class-b', trial_id: 'trial-1' },
] as DbClass[];

function entryOf(id: string, classId: string, dogId: string, armband: string, callName: string) {
  return {
    id,
    class_id: classId,
    dog_id: dogId,
    armband,
    run_order: 1,
    check_in_status: null,
    dog: { call_name: callName, owner: { first_name: 'Jamie', last_name: 'Walker' } },
  } as unknown as DbEntry;
}
const juni = entryOf('e1', 'class-a', 'dog-1', '101', 'Juni');
const hazel = entryOf('e2', 'class-a', 'dog-2', '102', 'Hazel');
const moss = entryOf('e3', 'class-b', 'dog-3', '103', 'Moss');
const DAY = '2026-12-07';

function cards(entries: DbEntry[], records: ReplicatedPaperworkPrint[]) {
  const map = buildClassPaperworkMap({
    showId: 'show-1',
    classes,
    trials: [{ id: 'trial-1', trialDate: DAY }],
    entries,
    records,
    returnTo: '/x',
  });
  const labels = (classId: string) =>
    map.get(classId)?.find(item => item.reportId === 'armband-labels');
  return { labels, map };
}

function recordOf(
  id: string,
  printedAt: string,
  descriptor: ReturnType<typeof buildArmbandPaperworkDescriptor>
): ReplicatedPaperworkPrint {
  return {
    id,
    showId: 'show-1',
    scopeKind: descriptor.scope.kind,
    reportId: 'armband-labels',
    coverage: descriptor.coverage,
    fingerprint: descriptor.fingerprint,
    printedBy: 'u1',
    printedByName: 'Jannie',
    printedAt,
  };
}

/** The panel's own descriptor for these labels, built as `ArmbandLabelsReport` builds it. */
function panelPrint(
  id: string,
  printedAt: string,
  labels: { entry: DbEntry; classId: string }[]
): ReplicatedPaperworkPrint {
  const descriptor = buildArmbandPaperworkDescriptor(
    { kind: 'show', showId: 'show-1' },
    labels.map(({ entry, classId }) => ({
      dogId: entry.dog_id ?? '',
      calendarDay: DAY,
      armband: Number(entry.armband),
      callName: String((entry as unknown as { dog: { call_name: string } }).dog.call_name),
      handlerName: 'Jamie Walker',
      classIds: [classId],
      trialIds: ['trial-1'],
    }))
  );
  return recordOf(id, printedAt, descriptor);
}

describe('armband labels card state, per label (MYK9-2073)', () => {
  const entries = [juni, hazel, moss];

  it('reads the card the panel printed as printed (card and panel share one fingerprint)', () => {
    const records = [
      panelPrint('p1', '2026-12-07T08:00:00Z', [
        { entry: juni, classId: 'class-a' },
        { entry: hazel, classId: 'class-a' },
      ]),
    ];
    expect(cards(entries, records).labels('class-a')?.state).toBe('current');
    expect(
      armbandLabelFingerprint({
        dogId: 'dog-1',
        armband: 101,
        calendarDay: DAY,
        callName: 'Juni',
        handlerName: 'Jamie Walker',
      })
    ).toBe(
      (records[0]!.coverage.subjectFingerprints as Record<string, string>)[`dog-day:dog-1:${DAY}`]
    );
  });

  it('keeps the class card printed after one dog label is reprinted', () => {
    const records = [
      panelPrint('p1', '2026-12-07T08:00:00Z', [
        { entry: juni, classId: 'class-a' },
        { entry: hazel, classId: 'class-a' },
      ]),
      panelPrint('p2', '2026-12-07T11:00:00Z', [{ entry: juni, classId: 'class-a' }]),
    ];
    const card = cards(entries, records).labels('class-a');
    expect(card?.state).toBe('current');
    // The newest print that covers the class's dogs is the reprint.
    expect(card?.recordId).toBe('p2');
  });

  it('marks both classes printed after one day print that covered both', () => {
    const records = [
      panelPrint('day', '2026-12-07T08:00:00Z', [
        { entry: juni, classId: 'class-a' },
        { entry: hazel, classId: 'class-a' },
        { entry: moss, classId: 'class-b' },
      ]),
    ];
    const { labels } = cards(entries, records);
    expect(labels('class-a')?.state).toBe('current');
    expect(labels('class-b')?.state).toBe('current');
  });

  it('marks the card stale when a printed label was renumbered, and when a dog was added', () => {
    const records = [
      panelPrint('p1', '2026-12-07T08:00:00Z', [
        { entry: juni, classId: 'class-a' },
        { entry: hazel, classId: 'class-a' },
      ]),
    ];
    const renumbered = { ...juni, armband: '150' } as DbEntry;
    expect(cards([renumbered, hazel, moss], records).labels('class-a')?.state).toBe('stale');
    const late = entryOf('e9', 'class-a', 'dog-9', '109', 'Late');
    expect(cards([...entries, late], records).labels('class-a')?.state).toBe('stale');
  });

  it('is not confirmed when no label was printed, and ignores undone prints', () => {
    expect(cards(entries, []).labels('class-a')?.state).toBe('unconfirmed');
    const undone = {
      ...panelPrint('p1', '2026-12-07T08:00:00Z', [{ entry: juni, classId: 'class-a' }]),
      voidedAt: '2026-12-07T09:00:00Z',
    };
    expect(cards(entries, [undone]).labels('class-a')?.state).toBe('unconfirmed');
  });
});

describe('armband labels card: one-dog prints (MYK9-2073)', () => {
  const entries = [juni, hazel, moss];
  const oneDog = (id: string, printedAt: string, printedByName: string) => {
    const record = panelPrint(id, printedAt, [{ entry: juni, classId: 'class-a' }]);
    return { ...record, printedByName, coverage: { ...record.coverage, oneDog: true } };
  };
  const classPrint = (printedByName: string) => ({
    ...panelPrint('full', '2026-12-07T08:00:00Z', [
      { entry: juni, classId: 'class-a' },
      { entry: hazel, classId: 'class-a' },
    ]),
    printedByName,
  });

  it('is not confirmed when only one dog label was ever printed', () => {
    const { labels } = cards(entries, [oneDog('one', '2026-12-07T09:00:00Z', 'B')]);
    expect(labels('class-a')?.state).toBe('unconfirmed');
  });

  it('is stale when a late entry came after a real class print', () => {
    const late = entryOf('e9', 'class-a', 'dog-9', '109', 'Late');
    const { labels } = cards([...entries, late], [classPrint('A')]);
    expect(labels('class-a')?.state).toBe('stale');
  });

  it('stays printed after a one-dog reprint, and names the class print', () => {
    const { labels } = cards(entries, [
      classPrint('A'),
      oneDog('one', '2026-12-07T11:00:00Z', 'B'),
    ]);
    const card = labels('class-a');
    expect(card?.state).toBe('current');
    expect(card?.printedBy).toBe('A');
  });
});
