import { describe, expect, it } from 'vitest';
import { collateTrialPacket } from '@/features/show-map/cockpit/trialPacket/collateTrialPacket';
import { selectPacketPages, toScoresheetModel } from './toScoresheetModel';
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

const trial = {
  id: 'trial-1',
  date: '2026-04-12',
  trial_number: 1,
  registry_id: 'AKC',
  event_number: null,
  name: null,
} as unknown as DbTrial;

const classData = (id: string, level: string) =>
  ({
    id,
    trial_id: trial.id,
    element: 'Container',
    level,
    section: 'A',
    class_number: null,
    display_order: 1,
    num_hides: null,
    distraction_count: null,
    time_limit_seconds: 120,
    num_areas: 1,
    status: 'scheduled',
  }) as unknown as DbClass;

const novice = classData('class-novice', 'Novice');
const advanced = classData('class-advanced', 'Advanced');

function entry(
  armband: number,
  classId: string,
  entryStatus: string,
  checkInStatus = 'no-status'
): DbEntry {
  return {
    id: `entry-${armband}`,
    class_id: classId,
    armband,
    run_order: armband,
    handler: 'Jamie Walker',
    entry_status: entryStatus,
    check_in_status: checkInStatus,
    dog: { call_name: `Dog${armband}`, breed: 'Beagle' },
  } as unknown as DbEntry;
}

// 1 normal, 2 moved-up source, 3 withdrawn, 4 pulled (scratched + pulled),
// 5 pending, 6 not accepted, 7 declined-by-secretary alias (rejected).
const noviceEntries = [
  entry(1, novice.id, 'confirmed'),
  entry(2, novice.id, 'moved'),
  entry(3, novice.id, 'withdrawn'),
  entry(4, novice.id, 'scratched', 'pulled'),
  entry(5, novice.id, 'pending'),
  entry(6, novice.id, 'not_accepted'),
];
// The move-up target: the same dog (armband 2) in the next level up.
const advancedEntries = [entry(2, advanced.id, 'confirmed')];

function armbandsOn(dataset: ReportDataSet, kind: 'check-in' | 'score-recording'): string[] {
  const model = selectPacketPages(toScoresheetModel(dataset, 'run-order'), kind);
  return model.pages.flatMap(page => page.entries.map(item => item.armband ?? ''));
}

describe('check-in sheets and scoresheets leave off dogs that will not run (MYK9-2082)', () => {
  const dataset: ReportDataSet = {
    show,
    pages: [{ trial, classData: novice, entries: noviceEntries }],
  };

  it('prints the check-in sheet with only the dogs that run', () => {
    expect(armbandsOn(dataset, 'check-in')).toEqual(['1', '5']);
  });

  it('prints the scoresheet with only the dogs that run', () => {
    expect(armbandsOn(dataset, 'score-recording')).toEqual(['1', '5']);
  });

  it('still shows the dog in the class it moved up to', () => {
    const target: ReportDataSet = {
      show,
      pages: [{ trial, classData: advanced, entries: advancedEntries }],
    };
    expect(armbandsOn(target, 'check-in')).toEqual(['2']);
    expect(armbandsOn(target, 'score-recording')).toEqual(['2']);
  });

  it('counts only the dogs that run on the judge cover sheet totals', () => {
    const packet = collateTrialPacket({
      show,
      trials: [trial],
      classes: [novice, advanced],
      entries: [...noviceEntries, ...advancedEntries],
      trialId: trial.id,
    });
    const judge = packet?.judges[0];
    const noviceClass = judge?.classes.find(item => item.classId === novice.id);
    expect(noviceClass?.dogCount).toBe(2);
    expect(noviceClass?.runOrder).toEqual(['1', '5']);
    expect(judge?.dogTotal).toBe(3);
  });

  it('counts a class whose every dog left as empty, not as a sheet to print', () => {
    const packet = collateTrialPacket({
      show,
      trials: [trial],
      classes: [novice],
      entries: [entry(2, novice.id, 'moved'), entry(3, novice.id, 'withdrawn')],
      trialId: trial.id,
    });
    expect(packet?.emptyClassCount).toBe(1);
    expect(packet?.judges).toHaveLength(0);
  });
});
