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
