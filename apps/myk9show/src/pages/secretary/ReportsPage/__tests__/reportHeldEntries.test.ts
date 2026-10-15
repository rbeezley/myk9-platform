/**
 * MYK9-1162: every report that lists who runs leaves out entries awaiting a
 * registration number, by one flag on its registry definition. Count and
 * financial reports keep them: a held entry still holds capacity and owes its fee.
 */
import { describe, expect, it } from 'vitest';
import { fromAny } from '@total-typescript/shoehorn';
import {
  buildClassReportProps,
  buildShowReportProps,
  buildTrialReportProps,
} from '../reportDataMapping';
import { omitHeldEntries } from '../reportHeldEntries';
import { reportRegistry } from '@/lib/reports/reportRegistry';
import type { ReportDbEntry, ReportDefinition } from '@/lib/reports/types';
import type { DbClass, DbEntry, DbTrial } from '@/types/database-mappings';
import type { Show } from '@/types/show-types';

const WHO_RUNS = [
  'check-in-sheet',
  'scoresheet',
  'results-sheet',
  'armband-labels',
  'show-catalog',
  'result-catalog',
  'result-labels',
  'steward-report',
  'akc-judge-report',
  'ukc-nosework-judges-book-element',
  'ukc-nosework-judges-book-handler-discrimination',
  'ukc-nosework-trial-score-sheet',
  'asca-scent-detection-trial-roster',
  'asca-scent-detection-score-sheet',
];
const KEEPS_HELD = [
  'financial-report',
  'show-entry-counts',
  'trial-entry-counts',
  'breed-entry-counts',
  'judge-entry-counts',
  'waitlist-report',
  'trial-secretary-report',
  'trial-chairman-report',
];

const show = { id: 'show-1', name: 'Show', organization: 'AKC' } as Show;
const trial = fromAny<DbTrial, unknown>({
  id: 'trial-1',
  date: '2026-04-12',
  registry_id: 'AKC',
  trial_number: '1',
});
const cls = fromAny<DbClass, unknown>({
  id: 'class-1',
  trial_id: 'trial-1',
  element: 'Buried',
  level: 'Novice',
});

function entry(id: string, registrations: unknown[]): ReportDbEntry {
  return fromAny<ReportDbEntry, unknown>({
    id,
    class_id: 'class-1',
    dog_id: `dog-${id}`,
    entry_status: 'confirmed',
    armband: id,
    dog: { id: `dog-${id}`, call_name: id, breed: 'Beagle', registrations },
  });
}
const entries = [
  entry('ok', [{ organization: 'AKC', registration_number: 'SR1' }]),
  entry('held', []),
];
const ids = (list: Array<{ id: string }> | undefined) => (list ?? []).map(e => e.id);

describe('registry flags', () => {
  const flag = (id: string) => reportRegistry.find(report => report.id === id)?.excludesHeldEntries;

  it.each(WHO_RUNS)('%s excludes held entries', id => {
    expect(flag(id)).toBe(true);
  });

  it.each(KEEPS_HELD)('%s keeps them', id => {
    expect(reportRegistry.some(report => report.id === id)).toBe(true);
    expect(flag(id)).not.toBe(true);
  });
});

describe('omitHeldEntries', () => {
  it('drops flagged entries only when asked', () => {
    const list = [{ id: 'a', awaitingRegistrationNumber: true }, { id: 'b' }];
    expect(ids(omitHeldEntries(list, true))).toEqual(['b']);
    expect(ids(omitHeldEntries(list, false))).toEqual(['a', 'b']);
    expect(ids(omitHeldEntries(list, undefined))).toEqual(['a', 'b']);
  });
});

describe('the builders apply the report flag', () => {
  const whoRuns = { id: 'x', scopes: ['show'], excludesHeldEntries: true } as ReportDefinition;
  const counts = { id: 'y', scopes: ['show'] } as ReportDefinition;
  const showInput = {
    show,
    trials: [trial],
    classes: [cls],
    entries: entries as unknown as DbEntry[],
    trialId: 'all',
    classId: 'all',
    dogId: 'all',
    sortOrder: 'armband',
  };

  it('show-scoped reports', () => {
    expect(ids(buildShowReportProps({ report: whoRuns, ...showInput }).entries)).toEqual(['ok']);
    expect(ids(buildShowReportProps({ report: counts, ...showInput }).entries)).toEqual([
      'ok',
      'held',
    ]);
  });

  it('trial-scoped reports', () => {
    const base = {
      show,
      trials: [trial],
      classes: [cls],
      entries,
      scope: { kind: 'show', showId: 'show-1' } as const,
      sortOrder: 'armband',
    };
    expect(ids(buildTrialReportProps({ ...base, omitHeldEntries: true })[0]?.entries)).toEqual([
      'ok',
    ]);
    expect(ids(buildTrialReportProps(base)[0]?.entries)).toEqual(['ok', 'held']);
  });

  it('class-scoped official reports', () => {
    const base = {
      show,
      trials: [trial],
      classes: [cls],
      entries,
      scope: { kind: 'class', showId: 'show-1', trialId: 'trial-1', classId: 'class-1' } as const,
      sortOrder: 'armband',
    };
    expect(ids(buildClassReportProps({ ...base, omitHeldEntries: true })?.entries)).toEqual(['ok']);
    expect(ids(buildClassReportProps(base)?.entries)).toEqual(['ok', 'held']);
  });
});
