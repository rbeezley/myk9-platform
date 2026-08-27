import { describe, expect, it } from 'vitest';
import { G9_NORMAL_SCENARIO, scenarioSessionCount } from './loadScenario';
import { LOAD_TOTAL_RING_COUNT } from './loadFixture';

// Derived so the fixture tracks the workload instead of pinning the old numbers.
const TOTAL = scenarioSessionCount(G9_NORMAL_SCENARIO);
const RINGSIDE = LOAD_TOTAL_RING_COUNT;
import { buildSessionAssignments } from './loadAssignments';
import { LoadSessionLifecycle } from './loadSessionLifecycle';

describe('load session lifecycle', () => {
  it('keeps prepared/open concurrency separate from early workflow failures', () => {
    const assignments = buildSessionAssignments(G9_NORMAL_SCENARIO).slice(0, 4);
    const lifecycle = new LoadSessionLifecycle(assignments);

    lifecycle.markPrepared(assignments);
    for (const assignment of assignments) lifecycle.markStarted(assignment);
    lifecycle.markFailed(assignments[0]);
    lifecycle.markCompleted(assignments[1]);
    lifecycle.markCompleted(assignments[2]);
    lifecycle.markCompleted(assignments[3]);

    expect(lifecycle.observation()).toMatchObject({
      configuredSessions: 4,
      preparedSessions: 4,
      startedWorkflows: 4,
      completedWorkflows: 3,
      failedWorkflows: 1,
      peakActiveWorkflows: 4,
    });
  });

  it('reconciles the full configured and ringside lifecycle', () => {
    const assignments = buildSessionAssignments(G9_NORMAL_SCENARIO);
    let nowMs = 0;
    const lifecycle = new LoadSessionLifecycle(assignments, () => {
      nowMs += 1;
      return nowMs;
    });

    lifecycle.markPrepared(assignments);
    for (const assignment of assignments) {
      lifecycle.markStarted(assignment);
      lifecycle.markCompleted(assignment);
    }

    expect(lifecycle.observation()).toMatchObject({
      configuredSessions: TOTAL,
      preparedSessions: TOTAL,
      startedWorkflows: TOTAL,
      completedWorkflows: TOTAL,
      failedWorkflows: 0,
      peakActiveWorkflows: 1,
      configuredRingsideSessions: RINGSIDE,
      preparedRingsideSessions: RINGSIDE,
      startedRingsideWorkflows: RINGSIDE,
      completedRingsideWorkflows: RINGSIDE,
      failedRingsideWorkflows: 0,
      peakActiveRingsideWorkflows: 1,
    });
    expect(lifecycle.observation().activityIntervals).toHaveLength(TOTAL);
  });
});
