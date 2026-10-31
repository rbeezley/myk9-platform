import { describe, expect, it } from 'vitest';
import { buildExhibitorDogs, type ShowDogLimitedRow } from './exhibitorDogIndex';

const row = (over: Partial<ShowDogLimitedRow> = {}): ShowDogLimitedRow => ({
  armband: 101,
  call_name: 'Zip',
  breed: 'Beagle',
  handler_name: 'Amy',
  class_id: 'c1',
  class_name: 'Container Novice',
  trial_name: 'Trial A',
  trial_date: '2026-11-01',
  check_in_status: 'checked-in',
  ...over,
});

describe('buildExhibitorDogs', () => {
  it("groups a dog's classes under its armband and carries run order and status", () => {
    const dogs = buildExhibitorDogs([
      row(),
      row({
        class_id: 'c2',
        class_name: 'Interior Novice',
        check_in_status: null,
      }),
      row({ armband: 102, call_name: 'Bo' }),
    ]);
    expect(dogs).toHaveLength(2);
    const zip = dogs[0]!;
    expect(zip).toMatchObject({
      key: 'armband:101',
      dogName: 'Zip',
      breed: 'Beagle',
      handler: 'Amy',
      armband: 101,
    });
    expect(zip.entries.map(e => [e.className, e.checkInStatus])).toEqual([
      ['Container Novice', 'checked-in'],
      ['Interior Novice', 'no-status'],
    ]);
  });

  it('labels a class with its trial and date so multiday trial names stay distinguishable', () => {
    const [sat, sun] = [
      buildExhibitorDogs([row({ trial_name: 'Trial 1', trial_date: '2026-11-07' })])[0]!
        .entries[0]!,
      buildExhibitorDogs([row({ trial_name: 'Trial 1', trial_date: '2026-11-08' })])[0]!
        .entries[0]!,
    ];
    expect(sat.trialLabel).toContain('Trial 1');
    expect(sat.trialLabel).not.toEqual(sun.trialLabel);
  });

  it('never carries result data: nothing scored, released or placed', () => {
    const entry = buildExhibitorDogs([row()])[0]!.entries[0]!;
    expect(entry).toMatchObject({
      isScored: false,
      resultText: null,
      searchTime: null,
      faultCount: null,
      placement: null,
      resultsReleased: false,
    });
  });

  it('marks a pulled dog pulled', () => {
    const entry = buildExhibitorDogs([row({ check_in_status: 'pulled' })])[0]!.entries[0]!;
    expect(entry.isPulled).toBe(true);
  });
});
