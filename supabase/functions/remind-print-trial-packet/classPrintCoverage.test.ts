// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { buildSheetDescriptorFromRows } from '../_shared/paperwork/rowDescriptors.ts';
import type { PaperworkClassRow, PaperworkEntryRow } from '../_shared/paperwork/rowDescriptors.ts';
import type { SheetPrintRow } from '../_shared/paperwork/printState.ts';
import { classPrintsCoverDay } from '../_shared/trialPacket/printReminder.ts';
import { loadClassPrintsCoverDay } from './classPrintCoverage.ts';
import { runPrintReminder } from './reminderRun.ts';

const SHOW_ID = 'a0000000-0000-4000-8000-000000000001';
const TRIAL_ID = 'b0000000-0000-4000-8000-000000000001';
const DAY = '2026-10-04';

const classA: PaperworkClassRow = {
  id: 'class-a',
  trial_id: TRIAL_ID,
  element: 'Container',
  level: 'Novice',
  section: 'A',
  status: 'scheduled',
  time_limit_seconds: 180,
  num_areas: 1,
};
const classB: PaperworkClassRow = { ...classA, id: 'class-b', element: 'Interior' };
const entry = (id: string, classId: string): PaperworkEntryRow => ({
  id,
  class_id: classId,
  dog_id: `dog-${id}`,
  armband: 100,
  run_order: 1,
  check_in_status: 'pending',
  entry_status: 'confirmed',
});
const entries = [entry('e1', 'class-a'), entry('e2', 'class-b')];

/** A print row written exactly as the app writes one: the descriptor's own coverage. */
function printRow(
  reportId: 'check-in-sheet' | 'scoresheet',
  classItem: PaperworkClassRow,
  rows: { classes: readonly PaperworkClassRow[]; entries: readonly PaperworkEntryRow[] },
  extra: Partial<SheetPrintRow> = {}
): SheetPrintRow {
  const descriptor = buildSheetDescriptorFromRows({
    reportId,
    scope: { kind: 'class', showId: SHOW_ID, trialId: TRIAL_ID, classId: classItem.id },
    ...rows,
  });
  if (!descriptor) throw new Error('fixture class has no entries');
  return {
    report_id: reportId,
    coverage: descriptor.coverage,
    printed_at: '2026-10-03T12:00:00.000Z',
    voided_at: null,
    ...extra,
  };
}

const rows = { classes: [classA, classB], entries };
const fullPrints = () => [
  printRow('check-in-sheet', classA, rows),
  printRow('scoresheet', classA, rows),
  printRow('check-in-sheet', classB, rows),
  printRow('scoresheet', classB, rows),
];
const cover = (
  prints: SheetPrintRow[],
  over: Partial<Parameters<typeof classPrintsCoverDay>[0]> = {}
) => classPrintsCoverDay({ showId: SHOW_ID, ...rows, prints, ...over });

describe('classPrintsCoverDay', () => {
  it('is covered when every class holds a current check-in sheet and scoresheet print', () => {
    expect(cover(fullPrints())).toBe(true);
  });

  it('is not covered when one class has no print', () => {
    expect(cover(fullPrints().slice(0, 2))).toBe(false);
  });

  it('is not covered when the scoresheet is missing but the check-in print exists', () => {
    expect(cover(fullPrints().filter(print => print.report_id === 'check-in-sheet'))).toBe(false);
    expect(cover(fullPrints().slice(0, 3))).toBe(false);
  });

  it('is not covered when an entry changed after the print', () => {
    const changed = [
      entry('e1', 'class-a'),
      { ...entry('e2', 'class-b'), entry_status: 'withdrawn' },
    ];
    expect(cover(fullPrints(), { entries: changed })).toBe(false);
  });

  it('is not covered when a later entry was added to a printed class', () => {
    expect(cover(fullPrints(), { entries: [...entries, entry('e3', 'class-a')] })).toBe(false);
  });

  it('does not count a voided print', () => {
    const prints = fullPrints();
    prints[3] = { ...prints[3]!, voided_at: '2026-10-03T13:00:00.000Z' };
    expect(cover(prints)).toBe(false);
  });

  it('judges by the latest print: a newer stale print outranks an older current one', () => {
    const stale = printRow(
      'check-in-sheet',
      classA,
      { classes: rows.classes, entries: [entry('e0', 'class-a'), ...entries] },
      { printed_at: '2026-10-03T18:00:00.000Z' }
    );
    expect(cover([...fullPrints(), stale])).toBe(false);
  });

  it('is covered by a trial-scoped print, as the class card reads it', () => {
    const trialPrint = (reportId: 'check-in-sheet' | 'scoresheet'): SheetPrintRow => {
      const descriptor = buildSheetDescriptorFromRows({
        reportId,
        scope: { kind: 'trial', showId: SHOW_ID, trialId: TRIAL_ID },
        ...rows,
      });
      return {
        report_id: reportId,
        coverage: descriptor!.coverage,
        printed_at: '2026-10-03T12:00:00.000Z',
        voided_at: null,
      };
    };
    expect(cover([trialPrint('check-in-sheet'), trialPrint('scoresheet')])).toBe(true);
  });

  it('skips a class with no entries and is not covered when no class has any', () => {
    const withEmpty = { classes: [classA, classB, { ...classA, id: 'class-c' }], entries };
    expect(cover(fullPrints(), withEmpty)).toBe(true);
    expect(cover([], { entries: [] })).toBe(false);
    expect(cover([], { classes: [] })).toBe(false);
  });
});

type Result = {
  data: unknown;
  error: { message: string } | null;
  /** A paged read fails from this row offset on (a later page), not on the first. */
  failFromRow?: number;
};

/** What `.range(from, to)` returns: the slice, or the error once the offset is past `failFromRow`. */
function pageOf(result: Result, from: number, to: number): Result {
  if (result.failFromRow !== undefined && from >= result.failFromRow) {
    return { data: null, error: { message: 'page failed' } };
  }
  return Array.isArray(result.data)
    ? { data: result.data.slice(from, to + 1), error: result.error }
    : result;
}

/** Table-keyed stub; every query chain resolves to the table's result. */
function stubClient(results: Record<string, Result>) {
  const from = vi.fn((table: string) => {
    const full = results[table] ?? { data: [], error: null };
    let result = full;
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit']) q[m] = () => q;
    q.range = (from: number, to: number) => {
      result = pageOf(full, from, to);
      return q;
    };
    q.maybeSingle = () => Promise.resolve(result);
    q.then = (res: (v: unknown) => unknown, rej?: (r: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej);
    return q;
  });
  return { from } as unknown as Parameters<typeof loadClassPrintsCoverDay>[0];
}

const dayData = (prints: SheetPrintRow[]): Record<string, Result> => ({
  trials: { data: [{ id: TRIAL_ID, status: 'scheduled' }], error: null },
  classes: { data: [classA, classB], error: null },
  entries: { data: entries, error: null },
  paperwork_prints: { data: prints, error: null },
});

describe('loadClassPrintsCoverDay', () => {
  it('reads the day and says covered for current prints', async () => {
    expect(await loadClassPrintsCoverDay(stubClient(dayData(fullPrints())), SHOW_ID, DAY)).toBe(
      true
    );
  });

  it('says not covered when one class is unprinted', async () => {
    const client = stubClient(dayData(fullPrints().slice(0, 2)));
    expect(await loadClassPrintsCoverDay(client, SHOW_ID, DAY)).toBe(false);
  });

  it('ignores cancelled trials and cancelled classes', async () => {
    const data = dayData(fullPrints().slice(0, 2));
    data.classes = { data: [classA, { ...classB, status: 'cancelled' }], error: null };
    expect(await loadClassPrintsCoverDay(stubClient(data), SHOW_ID, DAY)).toBe(true);
    data.trials = { data: [{ id: TRIAL_ID, status: 'cancelled' }], error: null };
    expect(await loadClassPrintsCoverDay(stubClient(data), SHOW_ID, DAY)).toBe(false);
  });

  it.each(['trials', 'classes', 'entries', 'paperwork_prints'])(
    'a read error on %s means not covered',
    async table => {
      const data = dayData(fullPrints());
      data[table] = { data: null, error: { message: 'boom' } };
      expect(await loadClassPrintsCoverDay(stubClient(data), SHOW_ID, DAY)).toBe(false);
    }
  );
});

describe('loadClassPrintsCoverDay paging', () => {
  // More rows than one PostgREST page (1000) holds, so a single unpaged read would drop the tail.
  const manyEntries = [
    ...entries,
    ...Array.from({ length: 1500 }, (_, index) => entry(`bulk-${index}`, 'class-a')),
  ];
  const manyRows = { classes: [classA, classB], entries: manyEntries };

  it('reads every page of entries and prints', async () => {
    const prints = [
      printRow('check-in-sheet', classA, manyRows),
      printRow('scoresheet', classA, manyRows),
      printRow('check-in-sheet', classB, manyRows),
      printRow('scoresheet', classB, manyRows),
    ];
    const data = dayData(prints);
    data.entries = { data: manyEntries, error: null };
    expect(await loadClassPrintsCoverDay(stubClient(data), SHOW_ID, DAY)).toBe(true);

    // 1000 older prints ahead of the four that matter: only a second page finds them.
    const filler = Array.from({ length: 1000 }, () => ({
      ...printRow('check-in-sheet', classA, rows),
      coverage: {},
    }));
    data.paperwork_prints = { data: [...filler, ...prints], error: null };
    expect(await loadClassPrintsCoverDay(stubClient(data), SHOW_ID, DAY)).toBe(true);
  });

  it('is not covered when a later page of entries fails', async () => {
    const data = dayData(fullPrints());
    data.entries = { data: manyEntries, error: null, failFromRow: 1000 };
    expect(await loadClassPrintsCoverDay(stubClient(data), SHOW_ID, DAY)).toBe(false);
  });

  it('is not covered when a later page of prints fails', async () => {
    const filler = Array.from({ length: 1000 }, () => printRow('scoresheet', classA, rows));
    const data = dayData([...filler, ...fullPrints()]);
    data.paperwork_prints = { data: [...filler, ...fullPrints()], error: null, failFromRow: 1000 };
    expect(await loadClassPrintsCoverDay(stubClient(data), SHOW_ID, DAY)).toBe(false);
  });
});

describe('runPrintReminder with the before-trial packet', () => {
  const request = { showId: SHOW_ID, trialDate: DAY, kind: 'evening-before' as const };
  const deps = { getEnv: () => 'k', now: () => new Date('2026-10-04T01:00:00.000Z') };

  function runClient(prints: SheetPrintRow[], emergencyRows: unknown[] = []) {
    const base = dayData(prints);
    const client = {
      from(table: string) {
        const filters: Record<string, unknown> = {};
        const result: () => Result =
          table === 'shows'
            ? () => ({
                data: { id: SHOW_ID, name: 'Heartland', club_id: null, end_date: '2026-10-05' },
                error: null,
              })
            : table === 'trial_packet_snapshots'
              ? () => ({ data: { snapshot_id: 'snap-1' }, error: null })
              : table === 'paperwork_prints'
                ? () =>
                    filters.report_id === 'emergency-trial-packet'
                      ? { data: emergencyRows, error: null }
                      : base.paperwork_prints!
                : () => base[table] ?? { data: [], error: null };
        const q: Record<string, unknown> = {};
        for (const m of ['select', 'is', 'in', 'order', 'limit', 'range']) q[m] = () => q;
        q.eq = (column: string, value: unknown) => {
          filters[column] = value;
          return q;
        };
        q.maybeSingle = () => Promise.resolve(result());
        q.then = (res: (v: unknown) => unknown, rej?: (r: unknown) => unknown) =>
          Promise.resolve(result()).then(res, rej);
        return q;
      },
    };
    return client as unknown as Parameters<typeof runPrintReminder>[0];
  }

  it('does not remind when every class was printed through the packet', async () => {
    expect(await runPrintReminder(runClient(fullPrints()), request, deps)).toEqual({
      sent: false,
      reason: 'already-printed',
    });
  });

  it('does not remind when the old emergency day row covers the day', async () => {
    const emergency = [
      {
        report_id: 'emergency-trial-packet',
        coverage: { trialDate: DAY, snapshotId: 'snap-1' },
        voided_at: null,
      },
    ];
    expect(await runPrintReminder(runClient([], emergency), request, deps)).toEqual({
      sent: false,
      reason: 'already-printed',
    });
  });
});
