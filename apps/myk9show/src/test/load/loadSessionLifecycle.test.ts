import { describe, expect, it } from 'vitest';
import { buildSessionAssignments } from './loadAssignments';
import { G9_NORMAL_SCENARIO } from './loadScenario';
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
      configuredSessions: 100,
      preparedSessions: 100,
      startedWorkflows: 100,
      completedWorkflows: 100,
      failedWorkflows: 0,
      peakActiveWorkflows: 1,
      configuredRingsideSessions: 55,
      preparedRingsideSessions: 55,
      startedRingsideWorkflows: 55,
      completedRingsideWorkflows: 55,
      failedRingsideWorkflows: 0,
      peakActiveRingsideWorkflows: 1,
    });
    expect(lifecycle.observation().activityIntervals).toHaveLength(100);
  });
});
