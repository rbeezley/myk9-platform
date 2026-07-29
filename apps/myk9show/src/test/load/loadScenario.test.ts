import { describe, expect, it } from 'vitest';
import { G9_NORMAL_SCENARIO, LOAD_SCENARIOS, validateScenarioDefinition } from './loadScenario';

describe('show-day load scenarios', () => {
  it('defines an immutable 100-session Normal gate with at least 50 ringside scorers', () => {
    const totalSessions = G9_NORMAL_SCENARIO.workloads.reduce(
      (sum, workload) => sum + workload.sessions,
      0
    );
    const ringsideSessions = G9_NORMAL_SCENARIO.workloads
      .filter(workload => workload.kind === 'ringside-scoring')
      .reduce((sum, workload) => sum + workload.sessions, 0);

    expect(totalSessions).toBe(100);
    expect(ringsideSessions).toBeGreaterThanOrEqual(50);
    expect(G9_NORMAL_SCENARIO.targets.databaseConnectionCap).toBe(60);
    expect(G9_NORMAL_SCENARIO.gate).toBe('G9');
    expect(Object.isFrozen(G9_NORMAL_SCENARIO)).toBe(true);
    expect(validateScenarioDefinition(G9_NORMAL_SCENARIO)).toEqual([]);
  });

  it('binds every required show-day workflow to a current route and role', () => {
    const kinds = new Set(G9_NORMAL_SCENARIO.workloads.map(workload => workload.kind));
    const exhibitorRead = G9_NORMAL_SCENARIO.workloads.find(
      workload => workload.kind === 'exhibitor-read'
    );
    const runOrderRead = G9_NORMAL_SCENARIO.workloads.find(
      workload => workload.kind === 'run-order-read'
    );

    expect(kinds).toEqual(
      new Set([
        'ringside-scoring',
        'secretary-check-in',
        'exhibitor-read',
        'run-order-read',
        'operations-read',
      ])
    );
    expect(G9_NORMAL_SCENARIO.workloads.every(workload => workload.route.startsWith('/'))).toBe(
      true
    );
    expect(G9_NORMAL_SCENARIO.workloads.some(workload => workload.route.includes('/api/'))).toBe(
      false
    );
    expect(exhibitorRead).toMatchObject({
      role: 'exhibitor',
      route: '/shows/{showId}?tab=my-entries',
    });
    expect(runOrderRead).toMatchObject({
      role: 'secretary',
      route: '/at-show/{showId}/class/{classId}',
    });
  });

  it('keeps Peak and Stress informational with their own budgets', () => {
    const peak = LOAD_SCENARIOS.find(scenario => scenario.id === 'peak');
    const stress = LOAD_SCENARIOS.find(scenario => scenario.id === 'stress');

    expect(peak).toMatchObject({
      gate: null,
      informational: true,
      targets: { errorRateMax: 0.1, throughputMin: 100, availabilityMin: 99 },
    });
    expect(stress).toMatchObject({
      gate: null,
      informational: true,
      targets: { errorRateMax: 0.25, throughputMin: 25, availabilityMin: 95 },
    });
  });
});
