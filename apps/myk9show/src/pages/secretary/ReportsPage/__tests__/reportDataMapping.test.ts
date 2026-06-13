import { describe, expect, it } from 'vitest';
import {
  buildTrialReportProps,
  mapScopedReportEntries,
  readTrialRegistryId,
} from '../reportDataMapping';
import { REPORT_ENTRY_SOURCE } from '@/lib/reports/types';
import type { DbClass, DbEntry, DbTrial } from '@/types/database-mappings';
import type { Show } from '@/types/show-types';

const show = {
  id: 'show-1',
  name: 'Spring Trial',
  clubName: 'Demo Scent Work Club',
  organization: 'AKC',
} as Show;

const trial = {
  id: 'trial-1',
  date: '2026-04-12',
  registry_id: 'UKC',
  trial_number: 2026123401,
} as DbTrial;

const classData = {
  id: 'class-1',
  trial_id: 'trial-1',
  element: 'Container',
  level: 'Novice',
  section: 'A',
  judge_name: 'Pat Judge',
} as DbClass;

const entry = {
  id: 'entry-1',
  armband: 7,
  class_id: 'class-1',
  run_order: 1,
  check_in_status: 'checked-in',
  is_scored: true,
  result_status: 'Q',
  search_time_seconds: 12.34,
  total_faults: 0,
  final_placement: 1,
  dog: {
    call_name: 'Rocket',
    breed: 'Beagle',
    owner: { first_name: 'Jamie', last_name: 'Walker' },
  },
  entry_source: REPORT_ENTRY_SOURCE.UKC_ONLINE,
} as unknown as DbEntry;

describe('buildTrialReportProps', () => {
  it('builds the same trial-scoped report props used by preview and official PDFs', () => {
    const [props] = buildTrialReportProps({
      show,
      trials: [trial],
      classes: [classData],
      entries: [entry],
      trialId: 'trial-1',
      sortOrder: '',
    });

    expect(props).toMatchObject({
      showId: 'show-1',
      showName: 'Spring Trial',
      clubName: 'Demo Scent Work Club',
      organization: 'AKC',
      trial: {
        date: '2026-04-12',
        registryId: 'UKC',
        trialNumber: '2026123401',
        judgeName: 'Pat Judge',
      },
      entries: [
        {
          id: 'entry-1',
          armband: 7,
          callName: 'Rocket',
          handler: 'Jamie Walker',
          entrySource: REPORT_ENTRY_SOURCE.UKC_ONLINE,
          classElement: 'Container',
          classLevel: 'Novice',
          classSection: 'A',
        },
      ],
    });
  });
});

describe('mapScopedReportEntries', () => {
  const trial1 = { id: 'trial-1', date: '2026-04-12', trial_number: 1 } as DbTrial;
  const trial2 = { id: 'trial-2', date: '2026-04-13', trial_number: 2 } as DbTrial;
  const class1 = {
    id: 'class-1',
    trial_id: 'trial-1',
    element: 'Container',
    level: 'Novice',
    section: 'A',
  } as DbClass;
  const class2 = {
    id: 'class-2',
    trial_id: 'trial-2',
    element: 'Interior',
    level: 'Advanced',
    section: '',
  } as DbClass;
  const mkEntry = (id: string, armband: number, classId: string) =>
    ({
      id,
      armband,
      class_id: classId,
      is_scored: true,
      result_status: 'Q',
      final_placement: 1,
      dog: {
        call_name: `Dog ${armband}`,
        breed: 'Breed',
        owner: { first_name: 'A', last_name: 'B' },
      },
    }) as unknown as DbEntry;

  const e1 = mkEntry('e1', 7, 'class-1'); // trial 1
  const e2 = mkEntry('e2', 8, 'class-2'); // trial 2
  const trials = [trial1, trial2];
  const classes = [class1, class2];

  it('Trial 1 / All Classes excludes other trials and labels each entry with its own trial/class', () => {
    // useReportData returns ALL show entries when classId === 'all'.
    const result = mapScopedReportEntries([e1, e2], trials, classes, 'trial-1', 'all');
    expect(result.map(r => r.id)).toEqual(['e1']);
    expect(result[0]).toMatchObject({
      trialNumber: '1',
      classElement: 'Container',
      classLevel: 'Novice',
      classSection: 'A',
    });
  });

  it('All Trials / All Classes keeps everything and enriches each per-entry', () => {
    const result = mapScopedReportEntries([e1, e2], trials, classes, 'all', 'all');
    expect(result.map(r => r.id)).toEqual(['e1', 'e2']);
    expect(result.find(r => r.id === 'e2')).toMatchObject({
      trialNumber: '2',
      classElement: 'Interior',
      classLevel: 'Advanced',
    });
  });

  it('single-class scope enriches the already-scoped entries with the selected class', () => {
    // useReportData has already filtered entries to class-1 here.
    const result = mapScopedReportEntries([e1], trials, classes, 'trial-1', 'class-1');
    expect(result.map(r => r.id)).toEqual(['e1']);
    expect(result[0]).toMatchObject({ classElement: 'Container', trialNumber: '1' });
  });
});

describe('readTrialRegistryId', () => {
  it('defaults to AKC when registry_id is missing or blank', () => {
    expect(readTrialRegistryId({ ...trial, registry_id: undefined } as unknown as DbTrial)).toBe(
      'AKC'
    );
    expect(readTrialRegistryId({ ...trial, registry_id: null } as unknown as DbTrial)).toBe('AKC');
    expect(readTrialRegistryId({ ...trial, registry_id: '   ' } as DbTrial)).toBe('AKC');
  });
});
