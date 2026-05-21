import { describe, expect, it } from 'vitest';
import { buildTrialReportProps, readTrialRegistryId } from '../reportDataMapping';
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
          classElement: 'Container',
          classLevel: 'Novice',
          classSection: 'A',
        },
      ],
    });
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
