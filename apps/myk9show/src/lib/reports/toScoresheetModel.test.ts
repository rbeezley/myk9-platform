import { describe, expect, it } from 'vitest';
import { toScoresheetModel, selectPacketPages } from './toScoresheetModel';
import type { ReportDataSet } from './types';
import type { DbClass, DbEntry, DbTrial } from '@/types/database-mappings';
import type { Show } from '@/types/show-types';

const show = {
  id: 'show-1',
  name: 'Spring Trial',
  clubName: 'Demo Scent Work Club',
  organization: 'AKC',
  startDate: '2026-04-12',
  endDate: '2026-04-12',
} as Show;

function trialFixture(id: string, overrides: Partial<DbTrial> = {}): DbTrial {
  return {
    id,
    date: '2026-04-12',
    trial_number: 1,
    registry_id: 'AKC',
    event_number: null,
    name: null,
    ...overrides,
  } as unknown as DbTrial;
}

function classFixture(id: string, trialId: string, overrides: Partial<DbClass> = {}): DbClass {
  return {
    id,
    trial_id: trialId,
    element: 'Container',
    level: 'Novice',
    section: 'A',
    class_number: null,
    display_order: 1,
    num_hides: null,
    distraction_count: null,
    time_limit_seconds: 120,
    num_areas: 1,
    ...overrides,
  } as unknown as DbClass;
}

function entryFixture(id: string, classId: string, armband: number, runOrder: number): DbEntry {
  return {
    id,
    class_id: classId,
    armband,
    run_order: runOrder,
    handler: 'Jamie Walker',
    dog: { call_name: 'Rocket', breed: 'Beagle' },
  } as unknown as DbEntry;
}

function datasetWithPages(classCount: number): ReportDataSet {
  const trial = trialFixture('trial-1');
  const pages = Array.from({ length: classCount }, (_, index) => {
    const classData = classFixture(`class-${index}`, trial.id);
    return {
      trial,
      classData,
      entries: [entryFixture(`entry-${index}`, classData.id, index + 1, index + 1)],
    };
  });
  return { show, pages };
}

function datasetWithHides(numHides: number, distractionCount: number): ReportDataSet {
  const trial = trialFixture('trial-1');
  const classData = classFixture('class-1', trial.id, {
    num_hides: numHides,
    distraction_count: distractionCount,
  });
  return {
    show,
    pages: [{ trial, classData, entries: [entryFixture('entry-1', classData.id, 3, 1)] }],
  };
}

function datasetWithArmbands(armbands: number[]): ReportDataSet {
  const trial = trialFixture('trial-1');
  const classData = classFixture('class-1', trial.id);
  return {
    show,
    pages: [
      {
        trial,
        classData,
        entries: armbands.map((armband, index) =>
          entryFixture(`entry-${index}`, classData.id, armband, index + 1)
        ),
      },
    ],
  };
}

describe('toScoresheetModel', () => {
  it('produces one class section per ReportDataSet page', () => {
    const model = toScoresheetModel(datasetWithPages(2), 'run-order');
    expect(model.pages.filter(page => page.kind === 'score-recording').length).toBeGreaterThan(0);
    expect(model.trials[0].classes).toHaveLength(2);
  });

  it('carries hides and distractions from classData into the model', () => {
    const model = toScoresheetModel(datasetWithHides(3, 2), 'run-order');
    const classRow = model.trials[0].classes[0];
    expect(classRow.numHides).toBe(3);
    expect(classRow.distractionCount).toBe(2);
  });

  it('honours the armband sort order', () => {
    const model = toScoresheetModel(datasetWithArmbands([7, 2, 5]), 'armband');
    const page = model.pages.find(p => p.kind === 'score-recording')!;
    expect(page.entries.map(entry => entry.armband)).toEqual([2, 5, 7]);
  });

  it('leaves entries in run order when sortOrder is not armband', () => {
    const model = toScoresheetModel(datasetWithArmbands([7, 2, 5]), 'run-order');
    const page = model.pages.find(p => p.kind === 'score-recording')!;
    // Armbands were assigned in reverse of run order by the fixture, so a
    // no-op sort should keep them exactly as entered (run order 1,2,3).
    expect(page.entries.map(entry => entry.armband)).toEqual([7, 2, 5]);
  });

  it('skips a page with no resolved class data rather than throwing', () => {
    const trial = trialFixture('trial-1');
    const dataset: ReportDataSet = {
      show,
      pages: [{ trial, classData: undefined, entries: [] }],
    };

    expect(() => toScoresheetModel(dataset, 'run-order')).not.toThrow();
    const model = toScoresheetModel(dataset, 'run-order');
    expect(model.pages.some(page => page.kind === 'score-recording')).toBe(false);
  });
});

function datasetWithManyEntries(count: number): {
  dataset: ReportDataSet;
  armbandAtRunOrder: (runOrder: number) => number;
} {
  const trial = trialFixture('trial-1');
  const classData = classFixture('class-1', trial.id);
  // Reverse armband vs. run order: run order 1 gets the HIGHEST armband and
  // run order `count` (the last dog, chunked onto a later run-order page by
  // the builder) gets armband 1 — the lowest. A correct global armband sort
  // must therefore move that last dog onto page 1.
  const armbandAtRunOrder = (runOrder: number) => count + 1 - runOrder;
  const entries = Array.from({ length: count }, (_, index) => {
    const runOrder = index + 1;
    return entryFixture(`entry-${runOrder}`, classData.id, armbandAtRunOrder(runOrder), runOrder);
  });
  return {
    dataset: { show, pages: [{ trial, classData, entries }] },
    armbandAtRunOrder,
  };
}

describe('reorderPagesByArmband (multi-page classes)', () => {
  it('moves a low-armband dog from a later run-order check-in page onto page 1', () => {
    // 25 entries: CHECK_IN_ROWS_PER_PAGE is 20, so run order 1-20 build under
    // the run-order sort onto check-in page 1, and run order 21-25 (armbands
    // 5,4,3,2,1 respectively) onto page 2. Armband 1 belongs to run order 25
    // — the last dog, on page 2 before an armband sort touches anything.
    const { dataset } = datasetWithManyEntries(25);

    const runOrderModel = toScoresheetModel(dataset, 'run-order');
    const runOrderCheckIn = selectPacketPages(runOrderModel, 'check-in');
    expect(runOrderCheckIn.pages).toHaveLength(2);
    expect(runOrderCheckIn.pages[0]!.entries).toHaveLength(20);
    expect(runOrderCheckIn.pages[1]!.entries).toHaveLength(5);
    // Confirm the premise: under run order alone, armband 1 is NOT on page 1.
    expect(runOrderCheckIn.pages[0]!.entries.some(entry => entry.armband === 1)).toBe(false);
    expect(runOrderCheckIn.pages[1]!.entries.some(entry => entry.armband === 1)).toBe(true);

    const armbandModel = toScoresheetModel(dataset, 'armband');
    const armbandCheckIn = selectPacketPages(armbandModel, 'check-in');
    expect(armbandCheckIn.pages).toHaveLength(2);
    // Page sizes are preserved (20 then 5) — only the assignment changes.
    expect(armbandCheckIn.pages[0]!.entries).toHaveLength(20);
    expect(armbandCheckIn.pages[1]!.entries).toHaveLength(5);

    expect(armbandCheckIn.pages[0]!.entries.map(entry => entry.armband)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1)
    );
    expect(armbandCheckIn.pages[1]!.entries.map(entry => entry.armband)).toEqual([21, 22, 23, 24, 25]);
    // The behavior the coordinator flagged as untested: armband 1, run-order
    // 25, was on page 2 above and must now be on page 1.
    expect(armbandCheckIn.pages[0]!.entries.some(entry => entry.armband === 1)).toBe(true);
    expect(armbandCheckIn.pages[1]!.entries.some(entry => entry.armband === 1)).toBe(false);
  });
});

describe('selectPacketPages', () => {
  it('filters to a single page kind and renumbers pages sequentially', () => {
    const model = toScoresheetModel(datasetWithPages(2), 'run-order');
    const selected = selectPacketPages(model, 'check-in');

    expect(selected.pages.length).toBeGreaterThan(0);
    expect(selected.pages.every(page => page.kind === 'check-in')).toBe(true);
    expect(selected.pages.map(page => page.pageNumber)).toEqual(
      selected.pages.map((_, index) => index + 1)
    );
  });
});
