/**
 * Multi-show load fixture.
 *
 * The platform runs several shows at once — the operator reports 3–5 on a busy
 * weekend — and a single-show fixture cannot surface cross-show behaviour at any
 * session count, because there is no second show generating deltas. Four shows:
 * one large (8 rings, the pre-existing fixture) and three mid-size (4 rings).
 *
 * Trials are modelled explicitly rather than flattened into a show. Classes
 * belong to trials, and `ReplicatedClassesTable` scopes its delta sync by
 * `trial_id`, so a fixture that collapsed a show to one trial would misrepresent
 * the sync boundary under test.
 *
 * Show 0 keeps its original identifiers and counts exactly, so the single-session
 * diagnostics and every prior measurement against it remain comparable. The
 * `LOAD_SHOW_ID` / `LOAD_CLASS_IDS` / `loadEntryFixture` exports still address it.
 */

export interface LoadTrialFixture {
  readonly trialId: string;
  readonly classIds: readonly string[];
}

export interface LoadShowFixture {
  /** Position in `LOAD_SHOWS`; also the UUID segment for shows after the first. */
  readonly index: number;
  readonly showId: string;
  readonly trials: readonly LoadTrialFixture[];
  /** Every class in the show, trial order then class order. */
  readonly classIds: readonly string[];
  /** Rings judged concurrently. One scoring session per ring, never more. */
  readonly ringCount: number;
  readonly dogCount: number;
  /** Deterministic entries this show generates: `dogCount * ringCount`. */
  readonly generatedEntryCount: number;
  /** Generated plus any hand-authored golden-path entries. */
  readonly showEntryCount: number;
  readonly armbandBase: number;
}

/** Dogs per show. Held at 63 so per-class size stays ~63, as every prior run measured. */
const DOGS_PER_SHOW = 63;

/** Classes per trial, matching the existing show-0 layout. */
const CLASSES_PER_TRIAL = 2;

/** Hand-authored golden-path entries, present only on the original show. */
const LARGE_SHOW_HAND_AUTHORED_ENTRIES = 12;

/**
 * Load ids carry their show in the FIRST digit of the final UUID group, with the
 * ordinal in the remaining eleven.
 *
 * This is deliberate and load-bearing for reseed cleanup. `seed-demo.sql` removes
 * load rows by contiguous UUID range (`a1090000-0000-0000-0002-…` for entries),
 * so encoding the show anywhere earlier in the UUID would fall outside those
 * ranges and leave every additional show's rows behind on reseed — accumulating
 * one orphaned set per rehearsal.
 *
 * Show 0 is unchanged by construction: a leading `0` plus an eleven-digit ordinal
 * is byte-identical to the twelve-digit ordinal it used before.
 */
function scopedPad(showIndex: number, value: number): string {
  if (showIndex < 0 || showIndex > 9) {
    throw new Error(`Load show index must fit one digit; received ${showIndex}.`);
  }
  return `${showIndex}${String(value).padStart(11, '0')}`;
}

function buildShow(
  index: number,
  showId: string,
  trials: readonly LoadTrialFixture[]
): LoadShowFixture {
  const classIds = trials.flatMap(trial => [...trial.classIds]);
  const handAuthored = index === 0 ? LARGE_SHOW_HAND_AUTHORED_ENTRIES : 0;
  return {
    index,
    showId,
    trials,
    classIds,
    ringCount: classIds.length,
    dogCount: DOGS_PER_SHOW,
    generatedEntryCount: DOGS_PER_SHOW * classIds.length,
    showEntryCount: DOGS_PER_SHOW * classIds.length + handAuthored,
    armbandBase: 2000 + index * 1000,
  };
}

/**
 * Class `…031` is deliberately absent: it is finalized, and the released-results
 * golden path must not be corruptible by a rehearsal write.
 */
const LARGE_SHOW_TRIALS: readonly LoadTrialFixture[] = [
  {
    trialId: 'dededede-0000-0000-0000-000000000021',
    classIds: ['dec1a55e-0000-0000-0000-000000000032', 'dec1a55e-0000-0000-0000-000000000033'],
  },
  {
    trialId: 'dededede-0000-0000-0000-000000000022',
    classIds: ['dec1a55e-0000-0000-0000-000000000034', 'dec1a55e-0000-0000-0000-000000000035'],
  },
  {
    trialId: 'dededede-0000-0000-0000-000000000023',
    classIds: ['dec1a55e-0000-0000-0000-000000000036', 'dec1a55e-0000-0000-0000-000000000037'],
  },
  {
    trialId: 'dededede-0000-0000-0000-000000000024',
    classIds: ['dec1a55e-0000-0000-0000-000000000038', 'dec1a55e-0000-0000-0000-000000000039'],
  },
];

/**
 * Shows after the first encode their index in the third UUID group, so every
 * generated row is attributable to its show by inspection and no range overlaps.
 */
function midShowTrials(index: number, trialCount: number): readonly LoadTrialFixture[] {
  return Array.from({ length: trialCount }, (_, trial) => ({
    trialId: `a1090000-0000-0000-0011-${scopedPad(index, trial + 1)}`,
    classIds: Array.from(
      { length: CLASSES_PER_TRIAL },
      (_unused, klass) =>
        `a1090000-0000-0000-0012-${scopedPad(index, trial * CLASSES_PER_TRIAL + klass + 1)}`
    ),
  }));
}

function midShow(index: number, trialCount: number): LoadShowFixture {
  return buildShow(
    index,
    `a1090000-0000-0000-0010-${scopedPad(index, 1)}`,
    midShowTrials(index, trialCount)
  );
}

export const LOAD_SHOWS: readonly LoadShowFixture[] = [
  buildShow(0, 'dededede-0000-0000-0000-000000000010', LARGE_SHOW_TRIALS),
  midShow(1, 2),
  midShow(2, 2),
  midShow(3, 2),
] as const;

/** The large show. Single-session diagnostics and probes address this one. */
export const PRIMARY_LOAD_SHOW = LOAD_SHOWS[0];

export const LOAD_SHOW_ID = PRIMARY_LOAD_SHOW.showId;
export const LOAD_CLASS_IDS = PRIMARY_LOAD_SHOW.classIds;
export const LOAD_GENERATED_ENTRY_COUNT = PRIMARY_LOAD_SHOW.generatedEntryCount;
export const LOAD_SHOW_ENTRY_COUNT = PRIMARY_LOAD_SHOW.showEntryCount;

/** Rings across every show. Caps scoring sessions: one per ring, never two on a class. */
export const LOAD_TOTAL_RING_COUNT = LOAD_SHOWS.reduce((total, show) => total + show.ringCount, 0);

export const LOAD_TOTAL_GENERATED_ENTRY_COUNT = LOAD_SHOWS.reduce(
  (total, show) => total + show.generatedEntryCount,
  0
);

export const LOAD_TOTAL_ENTRY_COUNT = LOAD_SHOWS.reduce(
  (total, show) => total + show.showEntryCount,
  0
);

export interface LoadEntryFixture {
  entryId: string;
  dogId: string;
  classId: string;
  trialId: string;
  showId: string;
  showIndex: number;
  dogNumber: number;
  armband: number;
}

function trialForClass(show: LoadShowFixture, classId: string): string {
  const trial = show.trials.find(candidate => candidate.classIds.includes(classId));
  /* c8 ignore next -- classIds is derived from trials, so a miss is impossible. */
  if (!trial) throw new Error(`Class ${classId} is not in show ${show.index}.`);
  return trial.trialId;
}

/**
 * Entries are laid out dog-major within a show: dog 1 in every ring, then dog 2.
 * Callers must not derive a class from `entryNumber % ringCount` to spread
 * sessions — that is what put seven concurrent scorers on one class. Use
 * `loadRingAssignment` for anything that needs one session per ring.
 */
export function loadEntryFixtureFor(showIndex: number, entryNumber: number): LoadEntryFixture {
  const show = LOAD_SHOWS[showIndex];
  if (!show) {
    throw new Error(`Load show index must be 0..${LOAD_SHOWS.length - 1}; received ${showIndex}.`);
  }
  if (!Number.isInteger(entryNumber) || entryNumber < 1 || entryNumber > show.generatedEntryCount) {
    throw new Error(
      `Load entry number for show ${showIndex} must be between 1 and ${show.generatedEntryCount}; received ${entryNumber}.`
    );
  }
  const dogNumber = Math.floor((entryNumber - 1) / show.ringCount) + 1;
  const ring = (entryNumber - 1) % show.ringCount;
  const classId = show.classIds[ring];
  return {
    entryId: `a1090000-0000-0000-0002-${scopedPad(showIndex, entryNumber)}`,
    dogId: `a1090000-0000-0000-0001-${scopedPad(showIndex, dogNumber)}`,
    classId,
    trialId: trialForClass(show, classId),
    showId: show.showId,
    showIndex,
    dogNumber,
    armband: show.armbandBase + dogNumber,
  };
}

/** Back-compatible accessor for the primary show. */
export function loadEntryFixture(entryNumber: number): LoadEntryFixture {
  return loadEntryFixtureFor(PRIMARY_LOAD_SHOW.index, entryNumber);
}

export interface LoadRingAssignment {
  readonly showIndex: number;
  readonly showId: string;
  readonly trialId: string;
  readonly classId: string;
  /** Ring position within its own show, not globally. */
  readonly ringIndex: number;
}

/**
 * Maps a global ring ordinal to exactly one class across every show. A scoring
 * session takes one of these, so two scorers can never share a class row.
 */
export function loadRingAssignment(ringOrdinal: number): LoadRingAssignment {
  if (!Number.isInteger(ringOrdinal) || ringOrdinal < 0 || ringOrdinal >= LOAD_TOTAL_RING_COUNT) {
    throw new Error(
      `Ring ordinal must be between 0 and ${LOAD_TOTAL_RING_COUNT - 1}; received ${ringOrdinal}.`
    );
  }
  let remaining = ringOrdinal;
  for (const show of LOAD_SHOWS) {
    if (remaining < show.ringCount) {
      const classId = show.classIds[remaining];
      return {
        showIndex: show.index,
        showId: show.showId,
        trialId: trialForClass(show, classId),
        classId,
        ringIndex: remaining,
      };
    }
    remaining -= show.ringCount;
  }
  /* c8 ignore next 2 -- unreachable: the range check above already bounds the ordinal. */
  throw new Error(`Unresolved ring ordinal ${ringOrdinal}.`);
}
