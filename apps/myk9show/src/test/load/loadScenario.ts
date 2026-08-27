import { LOAD_SHOWS, LOAD_TOTAL_RING_COUNT } from './loadFixture';

export type LoadScenarioId = 'normal' | 'peak' | 'stress';
export type LoadRole = 'secretary' | 'exhibitor' | 'admin';

/**
 * Five distinct paths take a row-exclusive lock on a class row, held to commit.
 * All but the last reach it through `refresh_class_scoring_state`:
 *
 *   scoring         is_scored / result_status / faults / time / points
 *   steward-check-in    check_in_status, staff credentials
 *   exhibitor-check-in  check_in_status, exhibitor self-check-in path
 *   class-edit          public.classes directly
 *   (scratch/pull/move) entry_status / class_id / deleted_at
 *
 * Modelling only one of them understates concurrency on the row that actually
 * serializes, which is the property this scenario exists to measure.
 */
export type LoadWorkloadKind =
  | 'ringside-scoring'
  | 'scoring-correction'
  | 'steward-check-in'
  | 'exhibitor-check-in'
  | 'secretary-class-edit'
  | 'exhibitor-read'
  | 'run-order-read'
  | 'operations-read';

/** Whether a workload writes. Writers must run on a real browser; readers need not. */
export const WRITER_WORKLOAD_KINDS: readonly LoadWorkloadKind[] = [
  'ringside-scoring',
  'scoring-correction',
  'steward-check-in',
  'exhibitor-check-in',
  'secretary-class-edit',
];

/** How a workload's sessions arrive, which changes what contention it produces. */
export type LoadArrivalPattern = 'steady' | 'class-start-burst';

/** Where a session count came from, so a number cannot become an invariant by inertia. */
export type LoadCountProvenance =
  | { readonly kind: 'ring-derived' }
  | { readonly kind: 'operator-observed'; readonly note: string }
  | { readonly kind: 'estimated'; readonly note: string; readonly replacedBy: string };

export interface LoadWorkload {
  readonly id: string;
  readonly kind: LoadWorkloadKind;
  readonly role: LoadRole;
  readonly sessions: number;
  readonly route: string;
  readonly arrival: LoadArrivalPattern;
  readonly provenance: LoadCountProvenance;
}

export interface LoadTargets {
  readonly apiP95Ms: number;
  readonly scoringWriteP95Ms: number;
  readonly errorRateMax: number;
  readonly throughputMin: number;
  readonly availabilityMin: number;
  /**
   * Equals the fixture's ring count. Derived, never fixed: it was `50` against a
   * 55-scorer workload, and leaving it there while scoring dropped to one per
   * ring would fail every run twice — at construction and again at evaluation.
   */
  readonly ringsideSessionsExact: number;
  readonly databaseConnectionCap: number;
}

export interface LoadScenario {
  readonly id: LoadScenarioId;
  readonly name: string;
  readonly browserBehaviorVersion: 'connected-devices-v3-generator-evidence';
  readonly gate: 'G9' | null;
  readonly informational: boolean;
  readonly durationMs: number;
  readonly rampUpMs: number;
  readonly workloads: readonly LoadWorkload[];
  readonly targets: LoadTargets;
}

const AT_SHOW_ROUTE = '/at-show/{showId}';
const CLASS_ROUTE = `${AT_SHOW_ROUTE}/class/{classId}`;
const EXHIBITOR_ENTRIES_ROUTE = '/shows/{showId}?tab=my-entries';
const SHOW_DESK_ROUTE = '/shows/{showId}/show-desk';

/** Connected exhibitors at peak, as a share of entrants. The softest number here. */
const CONNECTED_EXHIBITOR_SHARE = 0.6;

/** Exhibitors per show, operator-observed for the large show. */
const EXHIBITORS_PER_SHOW = [200, 80, 80, 80] as const;

/** Of connected exhibitors, the share watching run order rather than their entries. */
const RUN_ORDER_READER_SHARE = 0.7;

/** Concurrent self-check-ins per ring during a class-start burst. */
const EXHIBITOR_CHECK_INS_PER_RING = 2;

function connectedExhibitors(showIndex: number): number {
  return Math.round(EXHIBITORS_PER_SHOW[showIndex] * CONNECTED_EXHIBITOR_SHARE);
}

function sumOverShows(perShow: (showIndex: number) => number): number {
  return LOAD_SHOWS.reduce((total, show) => total + perShow(show.index), 0);
}

const READER_PROVENANCE: LoadCountProvenance = {
  kind: 'estimated',
  note: `${CONNECTED_EXHIBITOR_SHARE * 100}% of entrants connected at peak; dogs-ahead is checked repeatedly as a turn approaches`,
  replacedBy: 'real connected-session telemetry once the platform has users',
};

function freezeScenario(scenario: LoadScenario): LoadScenario {
  scenario.workloads.forEach(workload => Object.freeze(workload));
  Object.freeze(scenario.workloads);
  Object.freeze(scenario.targets);
  return Object.freeze(scenario);
}

/**
 * Writers are bounded by rings and shows, not by attendance. Only the
 * exhibitor-driven workloads scale with a busier platform, which is what
 * `readerScale` multiplies.
 */
function buildWorkloads(readerScale: number): readonly LoadWorkload[] {
  const runOrderReaders = sumOverShows(index =>
    Math.round(connectedExhibitors(index) * RUN_ORDER_READER_SHARE * readerScale)
  );
  const entryReaders = sumOverShows(
    index =>
      Math.round(connectedExhibitors(index) * readerScale) -
      Math.round(connectedExhibitors(index) * RUN_ORDER_READER_SHARE * readerScale)
  );
  // Bursty at class start, when the gate is busiest and the judge has begun.
  // Two per ring: writers must stay on real browsers, and at 16 runners this
  // keeps browser contexts per runner at today's 6-7 rather than pushing to 8,
  // where the generators already sit at 55-70% CPU.
  const exhibitorCheckIn = sumOverShows(index =>
    Math.round(LOAD_SHOWS[index].ringCount * EXHIBITOR_CHECK_INS_PER_RING * readerScale)
  );

  return [
    {
      id: 'ringside-scoring',
      kind: 'ringside-scoring',
      role: 'secretary',
      sessions: LOAD_TOTAL_RING_COUNT,
      route: `${CLASS_ROUTE}/score/{entryId}`,
      arrival: 'steady',
      provenance: { kind: 'ring-derived' },
    },
    {
      // Preserves the deliberate optimistic-concurrency coverage that the old
      // workload achieved by making sessions 50-54 collide on one entry. With one
      // scorer per ring there is no session 50, so that coverage would have
      // vanished silently. Modelled explicitly instead, and it matches what the
      // operator describes: a secretary correcting a score behind the judge is
      // the one realistic case of two writers on the same entry.
      id: 'scoring-correction',
      kind: 'scoring-correction',
      role: 'secretary',
      sessions: LOAD_SHOWS.length,
      route: `${CLASS_ROUTE}/score/{entryId}`,
      arrival: 'steady',
      provenance: {
        kind: 'operator-observed',
        note: 'a secretary may correct the same dog the judge is scoring; nobody else scores that class',
      },
    },
    {
      id: 'steward-check-in',
      kind: 'steward-check-in',
      role: 'secretary',
      sessions: LOAD_TOTAL_RING_COUNT,
      route: CLASS_ROUTE,
      arrival: 'class-start-burst',
      provenance: {
        kind: 'operator-observed',
        note: 'one person works the gate for each ring',
      },
    },
    {
      id: 'exhibitor-check-in',
      kind: 'exhibitor-check-in',
      role: 'exhibitor',
      sessions: exhibitorCheckIn,
      route: EXHIBITOR_ENTRIES_ROUTE,
      arrival: 'class-start-burst',
      provenance: {
        kind: 'estimated',
        note: `self-check-in clusters as a class opens; ${EXHIBITOR_CHECK_INS_PER_RING} concurrent per ring`,
        replacedBy: 'observed check-in arrival times from a real show',
      },
    },
    {
      id: 'secretary-class-edit',
      kind: 'secretary-class-edit',
      role: 'secretary',
      sessions: LOAD_SHOWS.length,
      route: CLASS_ROUTE,
      arrival: 'steady',
      provenance: {
        kind: 'operator-observed',
        note: 'one secretary per show adjusting classes while they run',
      },
    },
    {
      id: 'run-order-dogs-ahead',
      kind: 'run-order-read',
      role: 'exhibitor',
      sessions: runOrderReaders,
      route: CLASS_ROUTE,
      arrival: 'steady',
      provenance: READER_PROVENANCE,
    },
    {
      id: 'exhibitor-my-entries',
      kind: 'exhibitor-read',
      role: 'exhibitor',
      sessions: entryReaders,
      route: EXHIBITOR_ENTRIES_ROUTE,
      arrival: 'steady',
      provenance: READER_PROVENANCE,
    },
    {
      id: 'show-desk-operations',
      kind: 'operations-read',
      role: 'secretary',
      sessions: LOAD_SHOWS.length + 2,
      route: SHOW_DESK_ROUTE,
      arrival: 'steady',
      provenance: {
        kind: 'estimated',
        note: 'show-desk operators, roughly one per show plus relief',
        replacedBy: 'observed staffing from a real show',
      },
    },
  ];
}

export const G9_NORMAL_SCENARIO = freezeScenario({
  id: 'normal',
  name: 'G9 Normal show-day load',
  browserBehaviorVersion: 'connected-devices-v3-generator-evidence',
  gate: 'G9',
  informational: false,
  durationMs: 10 * 60 * 1_000,
  rampUpMs: 2 * 60 * 1_000,
  workloads: buildWorkloads(1),
  targets: {
    apiP95Ms: 200,
    scoringWriteP95Ms: 200,
    errorRateMax: 0.05,
    throughputMin: 50,
    availabilityMin: 99.5,
    ringsideSessionsExact: LOAD_TOTAL_RING_COUNT,
    databaseConnectionCap: 60,
  },
});

/**
 * Peak and stress scale the exhibitor-driven half only. A busier platform means
 * more people watching and checking in, not more judges crowding one ring — and
 * the one-scorer-per-class invariant forbids the latter anyway.
 *
 * Scaling writers further requires more shows in the fixture, not more sessions
 * per class. Both remain informational.
 */
function scaledScenario(
  id: Extract<LoadScenarioId, 'peak' | 'stress'>,
  name: string,
  readerScale: number,
  durationMs: number,
  rampUpMs: number,
  budget: Pick<LoadTargets, 'errorRateMax' | 'throughputMin' | 'availabilityMin'>
): LoadScenario {
  return freezeScenario({
    ...G9_NORMAL_SCENARIO,
    id,
    name,
    gate: null,
    informational: true,
    durationMs,
    rampUpMs,
    workloads: buildWorkloads(readerScale),
    targets: { ...G9_NORMAL_SCENARIO.targets, ...budget },
  });
}

const PEAK_SCENARIO = scaledScenario(
  'peak',
  'Peak show-day load',
  2,
  15 * 60 * 1_000,
  3 * 60 * 1_000,
  {
    errorRateMax: 0.1,
    throughputMin: 100,
    availabilityMin: 99,
  }
);

// Stress deliberately runs past what the platform is expected to serve, so its
// budget is looser than Peak's rather than stricter.
const STRESS_SCENARIO = scaledScenario(
  'stress',
  'Stress show-day load',
  4,
  20 * 60 * 1_000,
  4 * 60 * 1_000,
  { errorRateMax: 0.25, throughputMin: 25, availabilityMin: 95 }
);

export const LOAD_SCENARIOS = Object.freeze([G9_NORMAL_SCENARIO, PEAK_SCENARIO, STRESS_SCENARIO]);

const REQUIRED_WORKLOADS: readonly LoadWorkloadKind[] = [
  'ringside-scoring',
  'scoring-correction',
  'steward-check-in',
  'exhibitor-check-in',
  'secretary-class-edit',
  'exhibitor-read',
  'run-order-read',
  'operations-read',
];

export function scenarioSessionCount(scenario: LoadScenario): number {
  return scenario.workloads.reduce((total, workload) => total + workload.sessions, 0);
}

export function scenarioRingsideSessionCount(scenario: LoadScenario): number {
  return scenario.workloads
    .filter(workload => workload.kind === 'ringside-scoring')
    .reduce((total, workload) => total + workload.sessions, 0);
}

export function scenarioWriterSessionCount(scenario: LoadScenario): number {
  return scenario.workloads
    .filter(workload => WRITER_WORKLOAD_KINDS.includes(workload.kind))
    .reduce((total, workload) => total + workload.sessions, 0);
}

export function validateScenarioDefinition(scenario: LoadScenario): string[] {
  const failures: string[] = [];
  const presentKinds = new Set(scenario.workloads.map(workload => workload.kind));

  if (scenarioSessionCount(scenario) <= 0) failures.push('Scenario has no sessions.');

  // Equality, not a floor. One judge scores a class, one dog at a time; more
  // scoring sessions than rings would put two scorers on a class row, which is
  // the condition that produced a 9.4 s write p95 in run 33075234998.
  const scoring = scenarioRingsideSessionCount(scenario);
  if (scoring !== scenario.targets.ringsideSessionsExact) {
    failures.push(
      `Scoring sessions (${scoring}) must equal the ring count (${scenario.targets.ringsideSessionsExact}).`
    );
  }
  if (scoring > LOAD_TOTAL_RING_COUNT) {
    failures.push(
      `Scoring sessions (${scoring}) over-subscribe the fixture's ${LOAD_TOTAL_RING_COUNT} rings; add shows rather than scorers.`
    );
  }

  // The mix is read-dominant in reality. An edit that inverts it should fail
  // rather than quietly measure a write-heavy shape that does not occur.
  if (scenarioWriterSessionCount(scenario) >= scenarioSessionCount(scenario) / 2) {
    failures.push('Writer sessions must remain a minority of the workload.');
  }

  for (const kind of REQUIRED_WORKLOADS) {
    if (!presentKinds.has(kind)) failures.push(`Missing required workload: ${kind}.`);
  }
  for (const workload of scenario.workloads) {
    if (!workload.route.startsWith('/')) failures.push(`${workload.id} has a non-route target.`);
    if (workload.route.includes('/api/')) failures.push(`${workload.id} uses a legacy API route.`);
    if (workload.sessions <= 0) failures.push(`${workload.id} has no sessions.`);
  }
  return failures;
}
