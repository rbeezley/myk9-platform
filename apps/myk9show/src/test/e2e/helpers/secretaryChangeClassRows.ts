/**
 * Rows for the Change class dialog spec (MYK9-1265), served by
 * `installSecretaryFixture({ changeClass: true })`.
 *
 * Trial 1 holds Buried Novice A (with one accepted entry that has not run) plus
 * Buried Advanced, Excellent and Master (Master is full); trial 2 is a second
 * trial of the same show with a Buried Novice A and an Interior Advanced. The
 * dog already holds a live entry in none of the others.
 */
const STAMP = '2026-01-01T00:00:00.000Z';

export const CHANGE_CLASS_IDS = {
  noviceA: 'f1f1f1f1-0000-0000-0000-000000000201',
  advanced: 'f1f1f1f1-0000-0000-0000-000000000202',
  excellent: 'f1f1f1f1-0000-0000-0000-000000000203',
  master: 'f1f1f1f1-0000-0000-0000-000000000204',
  trial2NoviceA: 'f1f1f1f1-0000-0000-0000-000000000205',
  trial2InteriorAdvanced: 'f1f1f1f1-0000-0000-0000-000000000206',
} as const;
export const CHANGE_CLASS_TRIAL_2_ID = 'f1f1f1f1-0000-0000-0000-000000000112';
export const CHANGE_CLASS_ENTRY_ID = 'f1f1f1f1-0000-0000-0000-000000000301';
export const CHANGE_CLASS_FULL_ENTRY_IDS = Array.from(
  { length: 2 },
  (_, i) => `f1f1f1f1-0000-0000-0000-00000000040${i}`
);

interface ClassSeed {
  id: string;
  trialId: string;
  element: string;
  level: string;
  section: string | null;
  maxEntries: number;
}

function classRow(seed: ClassSeed, index: number) {
  return {
    id: seed.id,
    trial_id: seed.trialId,
    name: [seed.element, seed.level, seed.section].filter(Boolean).join(' '),
    element: seed.element,
    level: seed.level,
    section: seed.section,
    competition_type: 'regular',
    entry_fee: 30,
    max_entries: seed.maxEntries,
    allow_waitlist: true,
    status: 'upcoming',
    status_source: 'manual',
    display_order: index,
    deleted_at: null,
    version: 1,
    created_at: STAMP,
    updated_at: STAMP,
  };
}

export function buildChangeClassClasses(trial1Id: string) {
  const ids = CHANGE_CLASS_IDS;
  const seeds: ClassSeed[] = [
    {
      id: ids.noviceA,
      trialId: trial1Id,
      element: 'Buried',
      level: 'Novice',
      section: 'A',
      maxEntries: 50,
    },
    {
      id: ids.advanced,
      trialId: trial1Id,
      element: 'Buried',
      level: 'Advanced',
      section: null,
      maxEntries: 50,
    },
    {
      id: ids.excellent,
      trialId: trial1Id,
      element: 'Buried',
      level: 'Excellent',
      section: null,
      maxEntries: 50,
    },
    // Capacity 1 and one accepted entry already in it: full.
    {
      id: ids.master,
      trialId: trial1Id,
      element: 'Buried',
      level: 'Master',
      section: null,
      maxEntries: 1,
    },
    {
      id: ids.trial2NoviceA,
      trialId: CHANGE_CLASS_TRIAL_2_ID,
      element: 'Buried',
      level: 'Novice',
      section: 'A',
      maxEntries: 50,
    },
    {
      id: ids.trial2InteriorAdvanced,
      trialId: CHANGE_CLASS_TRIAL_2_ID,
      element: 'Interior',
      level: 'Advanced',
      section: null,
      maxEntries: 50,
    },
  ];
  return seeds.map(classRow);
}

export function buildChangeClassTrial2(show: { id: string; date: string }) {
  return {
    id: CHANGE_CLASS_TRIAL_2_ID,
    show_id: show.id,
    name: 'Saturday Trial 2',
    date: show.date,
    trial_number: '2',
    timezone: 'America/Chicago',
    registry_id: 'AKC',
    status: 'planned',
    trial_type: 'scent_work',
    event_number: '2026000002',
    pipeline_stage: 0,
    deleted_at: null,
    version: 1,
    created_at: STAMP,
    updated_at: STAMP,
  };
}

function entryRow(
  id: string,
  classId: string,
  showId: string,
  trialId: string,
  armband: string,
  dogId: string,
  callName: string
) {
  return {
    id,
    class_id: classId,
    show_id: showId,
    trial_id: trialId,
    dog_id: dogId,
    armband,
    entry_status: 'confirmed',
    check_in_status: 'no-status',
    payment_status: 'paid',
    entry_fee: 30,
    dog_call_name: callName,
    dog_breed: 'Belgian Tervuren',
    dogs: { call_name: callName, breed: 'Belgian Tervuren', owner_id: null },
    deleted_at: null,
    version: 1,
    created_at: STAMP,
    updated_at: STAMP,
  };
}

export function buildChangeClassEntries(showId: string, trial1Id: string) {
  const ids = CHANGE_CLASS_IDS;
  return [
    entryRow(
      CHANGE_CLASS_ENTRY_ID,
      ids.noviceA,
      showId,
      trial1Id,
      '101',
      'f1f1f1f1-0000-0000-0000-000000000501',
      'Rex'
    ),
    // The seat that makes Buried Master full.
    entryRow(
      CHANGE_CLASS_FULL_ENTRY_IDS[0]!,
      ids.master,
      showId,
      trial1Id,
      '102',
      'f1f1f1f1-0000-0000-0000-000000000502',
      'Pip'
    ),
  ];
}
