import { describe, expect, it } from 'vitest';
import { LOAD_SHOWS, LOAD_TOTAL_RING_COUNT } from './loadFixture';
import {
  G9_NORMAL_SCENARIO,
  LOAD_SCENARIOS,
  scenarioRingsideSessionCount,
  scenarioSessionCount,
  scenarioWriterSessionCount,
  validateScenarioDefinition,
  WRITER_WORKLOAD_KINDS,
} from './loadScenario';

describe('show-day load scenarios', () => {
  it('scores one session per ring, never two on a class', () => {
    // Replaces "at least 50 ringside scorers". Fifty-five sessions over eight
    // classes put roughly seven scorers on every class row, which cannot happen
    // at a show and produced a 9.4 s write p95 that measured queueing.
    expect(scenarioRingsideSessionCount(G9_NORMAL_SCENARIO)).toBe(LOAD_TOTAL_RING_COUNT);
    expect(G9_NORMAL_SCENARIO.targets.ringsideSessionsExact).toBe(LOAD_TOTAL_RING_COUNT);
    expect(G9_NORMAL_SCENARIO.targets.databaseConnectionCap).toBe(60);
    expect(G9_NORMAL_SCENARIO.browserBehaviorVersion).toBe(
      'connected-devices-v3-generator-evidence'
    );
    expect(G9_NORMAL_SCENARIO.gate).toBe('G9');
    expect(Object.isFrozen(G9_NORMAL_SCENARIO)).toBe(true);
    expect(validateScenarioDefinition(G9_NORMAL_SCENARIO)).toEqual([]);
  });

  it('is read-dominant, as a show day actually is', () => {
    // Writers are bounded by rings; readers scale with attendance. An edit that
    // inverts this should fail rather than quietly measure a write-heavy shape.
    const total = scenarioSessionCount(G9_NORMAL_SCENARIO);
    const writers = scenarioWriterSessionCount(G9_NORMAL_SCENARIO);
    expect(writers).toBeLessThan(total / 2);
    expect(total).toBeGreaterThan(300);
  });

  it('models every actor that writes a class being scored', () => {
    const kinds = new Set(G9_NORMAL_SCENARIO.workloads.map(workload => workload.kind));
    expect(kinds).toEqual(
      new Set([
        'ringside-scoring',
        'scoring-correction',
        'steward-check-in',
        'exhibitor-check-in',
        'secretary-class-edit',
        'exhibitor-read',
        'run-order-read',
        'operations-read',
      ])
    );
    // Five lock holders, four of which reach the class row through the entries
    // trigger. Modelling only one understates concurrency on the row that
    // serializes.
    expect(WRITER_WORKLOAD_KINDS).toHaveLength(5);
  });

  it('runs exhibitor work under exhibitor credentials', () => {
    // Self-check-in uses different authorization and a different mutation from
    // the staff path. The runner selects credentials from this role, so a wrong
    // role here silently exercises the secretary path and reports it as
    // exhibitor coverage.
    const byKind = new Map(G9_NORMAL_SCENARIO.workloads.map(w => [w.kind, w]));
    expect(byKind.get('exhibitor-check-in')?.role).toBe('exhibitor');
    expect(byKind.get('exhibitor-read')?.role).toBe('exhibitor');
    expect(byKind.get('steward-check-in')?.role).toBe('secretary');
    expect(byKind.get('ringside-scoring')?.role).toBe('secretary');
  });

  it('bursts check-in at class start rather than arriving uniformly', () => {
    const byKind = new Map(G9_NORMAL_SCENARIO.workloads.map(w => [w.kind, w]));
    expect(byKind.get('steward-check-in')?.arrival).toBe('class-start-burst');
    expect(byKind.get('exhibitor-check-in')?.arrival).toBe('class-start-burst');
    expect(byKind.get('ringside-scoring')?.arrival).toBe('steady');
  });

  it('records where every session count came from', () => {
    // The previous workload froze 55 and three changes preserved it verbatim
    // without ever modelling it. Provenance is what stops that recurring.
    for (const workload of G9_NORMAL_SCENARIO.workloads) {
      expect(workload.provenance.kind).toMatch(/^(ring-derived|operator-observed|estimated)$/);
      if (workload.provenance.kind === 'estimated') {
        expect(workload.provenance.replacedBy.length).toBeGreaterThan(0);
      }
    }
  });

  it('binds every workload to a current route', () => {
    expect(G9_NORMAL_SCENARIO.workloads.every(w => w.route.startsWith('/'))).toBe(true);
    expect(G9_NORMAL_SCENARIO.workloads.some(w => w.route.includes('/api/'))).toBe(false);
  });

  it('rejects a scenario that over-subscribes a class', () => {
    const oversubscribed = {
      ...G9_NORMAL_SCENARIO,
      workloads: G9_NORMAL_SCENARIO.workloads.map(workload =>
        workload.kind === 'ringside-scoring'
          ? { ...workload, sessions: LOAD_TOTAL_RING_COUNT + 1 }
          : workload
      ),
    };
    const failures = validateScenarioDefinition(oversubscribed);
    expect(failures.join(' ')).toMatch(/must equal the ring count|over-subscribe/);
  });

  it('rejects a write-heavy mix', () => {
    const writeHeavy = {
      ...G9_NORMAL_SCENARIO,
      workloads: G9_NORMAL_SCENARIO.workloads.filter(w => WRITER_WORKLOAD_KINDS.includes(w.kind)),
    };
    expect(validateScenarioDefinition(writeHeavy).join(' ')).toContain(
      'Writer sessions must remain a minority'
    );
  });
});

describe('peak and stress', () => {
  const peak = LOAD_SCENARIOS.find(scenario => scenario.id === 'peak');
  const stress = LOAD_SCENARIOS.find(scenario => scenario.id === 'stress');

  it('keeps both informational with their own budgets', () => {
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

  it('scales by readers, never by scorers per class', () => {
    // Peak previously declared 125 ringside sessions and stress 250, against the
    // same eight classes — the same impossibility at larger scale. A busier
    // platform means more people watching, not more judges crowding one ring.
    for (const scenario of [peak, stress]) {
      expect(scenarioRingsideSessionCount(scenario!)).toBe(LOAD_TOTAL_RING_COUNT);
      expect(validateScenarioDefinition(scenario!)).toEqual([]);
    }
    expect(scenarioSessionCount(stress!)).toBeGreaterThan(scenarioSessionCount(peak!));
    expect(scenarioSessionCount(peak!)).toBeGreaterThan(scenarioSessionCount(G9_NORMAL_SCENARIO));
  });

  it('would need more shows, not more sessions per class, to scale writers', () => {
    // Documents the ceiling: writers are pinned to the fixture's ring count.
    expect(LOAD_TOTAL_RING_COUNT).toBe(LOAD_SHOWS.reduce((n, s) => n + s.ringCount, 0));
  });
});
