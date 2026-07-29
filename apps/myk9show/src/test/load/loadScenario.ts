export type LoadScenarioId = 'normal' | 'peak' | 'stress';
export type LoadRole = 'secretary' | 'exhibitor' | 'admin';
export type LoadWorkloadKind =
  | 'ringside-scoring'
  | 'secretary-check-in'
  | 'exhibitor-read'
  | 'run-order-read'
  | 'operations-read';

export interface LoadWorkload {
  readonly id: string;
  readonly kind: LoadWorkloadKind;
  readonly role: LoadRole;
  readonly sessions: number;
  readonly route: string;
}

export interface LoadTargets {
  readonly apiP95Ms: number;
  readonly scoringWriteP95Ms: number;
  readonly errorRateMax: number;
  readonly throughputMin: number;
  readonly availabilityMin: number;
  readonly ringsideSessionsMin: number;
  readonly databaseConnectionCap: number;
}

export interface LoadScenario {
  readonly id: LoadScenarioId;
  readonly name: string;
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

function freezeScenario(scenario: LoadScenario): LoadScenario {
  scenario.workloads.forEach(workload => Object.freeze(workload));
  Object.freeze(scenario.workloads);
  Object.freeze(scenario.targets);
  return Object.freeze(scenario);
}

export const G9_NORMAL_SCENARIO = freezeScenario({
  id: 'normal',
  name: 'G9 Normal show-day load',
  gate: 'G9',
  informational: false,
  durationMs: 10 * 60 * 1_000,
  rampUpMs: 2 * 60 * 1_000,
  workloads: [
    {
      id: 'ringside-scoring',
      kind: 'ringside-scoring',
      role: 'secretary',
      sessions: 55,
      route: `${CLASS_ROUTE}/score/{entryId}`,
    },
    {
      id: 'secretary-check-in',
      kind: 'secretary-check-in',
      role: 'secretary',
      sessions: 15,
      route: CLASS_ROUTE,
    },
    {
      id: 'exhibitor-my-entries',
      kind: 'exhibitor-read',
      role: 'exhibitor',
      sessions: 15,
      route: EXHIBITOR_ENTRIES_ROUTE,
    },
    {
      id: 'run-order-dogs-ahead',
      kind: 'run-order-read',
      role: 'secretary',
      sessions: 10,
      route: CLASS_ROUTE,
    },
    {
      id: 'show-desk-operations',
      kind: 'operations-read',
      role: 'secretary',
      sessions: 5,
      route: '/shows/{showId}/show-desk',
    },
  ],
  targets: {
    apiP95Ms: 200,
    scoringWriteP95Ms: 200,
    errorRateMax: 0.05,
    throughputMin: 50,
    availabilityMin: 99.5,
    ringsideSessionsMin: 50,
    databaseConnectionCap: 60,
  },
});

const PEAK_SCENARIO = freezeScenario({
  ...G9_NORMAL_SCENARIO,
  id: 'peak',
  name: 'Peak show-day load',
  gate: null,
  informational: true,
  durationMs: 15 * 60 * 1_000,
  rampUpMs: 3 * 60 * 1_000,
  workloads: G9_NORMAL_SCENARIO.workloads.map(workload =>
    Object.freeze({
      ...workload,
      sessions:
        workload.kind === 'ringside-scoring'
          ? 125
          : workload.kind === 'secretary-check-in'
            ? 50
            : 25,
    })
  ),
  targets: {
    ...G9_NORMAL_SCENARIO.targets,
    errorRateMax: 0.1,
    throughputMin: 100,
    availabilityMin: 99,
    ringsideSessionsMin: 125,
  },
});

const STRESS_SCENARIO = freezeScenario({
  ...G9_NORMAL_SCENARIO,
  id: 'stress',
  name: 'Stress show-day load',
  gate: null,
  informational: true,
  durationMs: 20 * 60 * 1_000,
  rampUpMs: 5 * 60 * 1_000,
  workloads: G9_NORMAL_SCENARIO.workloads.map(workload =>
    Object.freeze({
      ...workload,
      sessions:
        workload.kind === 'ringside-scoring'
          ? 250
          : workload.kind === 'secretary-check-in'
            ? 100
            : 50,
    })
  ),
  targets: {
    ...G9_NORMAL_SCENARIO.targets,
    errorRateMax: 0.25,
    throughputMin: 25,
    availabilityMin: 95,
    ringsideSessionsMin: 250,
  },
});

export const LOAD_SCENARIOS = Object.freeze([G9_NORMAL_SCENARIO, PEAK_SCENARIO, STRESS_SCENARIO]);

const REQUIRED_WORKLOADS: readonly LoadWorkloadKind[] = [
  'ringside-scoring',
  'secretary-check-in',
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

export function validateScenarioDefinition(scenario: LoadScenario): string[] {
  const failures: string[] = [];
  const presentKinds = new Set(scenario.workloads.map(workload => workload.kind));

  if (scenarioSessionCount(scenario) <= 0) failures.push('Scenario has no sessions.');
  if (scenarioRingsideSessionCount(scenario) < scenario.targets.ringsideSessionsMin) {
    failures.push('Ringside-session count is below its declared target.');
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
