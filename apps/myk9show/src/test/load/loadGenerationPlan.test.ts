import { describe, expect, it } from 'vitest';
import { buildSessionAssignments } from './loadAssignments';
import { describeGenerationPlan, planGeneration } from './loadGenerationPlan';
import { G9_NORMAL_SCENARIO, WRITER_WORKLOAD_KINDS } from './loadScenario';
import { DISTRIBUTED_G9_SHARD_COUNT } from './loadShard';

const assignments = buildSessionAssignments(G9_NORMAL_SCENARIO);
const plan = planGeneration(assignments, { browserReaderSample: DISTRIBUTED_G9_SHARD_COUNT });

describe('generation plan', () => {
  it('accounts for every session exactly once', () => {
    expect(plan.browser.length + plan.virtualUser.length).toBe(assignments.length);
    const sequences = [...plan.browser, ...plan.virtualUser].map(a => a.sequence);
    expect(new Set(sequences).size).toBe(assignments.length);
  });

  it('keeps every writer on a real browser', () => {
    // OCC, the replication queue, the offline store and the mutation upload path
    // are exactly what a write workload exercises, and a virtual user bypasses
    // all three. A writer routed to a virtual user would measure nothing useful.
    for (const assignment of plan.virtualUser) {
      expect(WRITER_WORKLOAD_KINDS).not.toContain(assignment.kind);
    }
    const browserWriters = plan.browser.filter(a => WRITER_WORKLOAD_KINDS.includes(a.kind));
    const allWriters = assignments.filter(a => WRITER_WORKLOAD_KINDS.includes(a.kind));
    expect(browserWriters).toHaveLength(allWriters.length);
  });

  it('keeps a browser reader sample so rendering stays covered', () => {
    // A virtual reader issues the same requests but never paints. Without this
    // sample a passing run would claim browser coverage it does not have.
    const browserReaders = plan.browser.filter(
      a => a.kind === 'exhibitor-read' || a.kind === 'run-order-read'
    );
    expect(browserReaders).toHaveLength(DISTRIBUTED_G9_SHARD_COUNT);
  });

  it('moves the reader bulk to virtual users', () => {
    expect(plan.virtualUser.length).toBeGreaterThan(200);
    for (const assignment of plan.virtualUser) {
      expect(['exhibitor-read', 'run-order-read']).toContain(assignment.kind);
    }
  });

  it('brings browser contexts per runner back to today’s level', () => {
    // The number this whole increment exists for. All-browser generation needs
    // 22.4 contexts per runner; today's runs sit at 6-7 and already drive the
    // generators to 55-70% CPU.
    const perRunner = plan.browser.length / DISTRIBUTED_G9_SHARD_COUNT;
    expect(perRunner).toBeLessThanOrEqual(7);
    expect(assignments.length / DISTRIBUTED_G9_SHARD_COUNT).toBeGreaterThan(20);
  });

  it('keeps operations sessions on real browsers', () => {
    const opsInVirtual = plan.virtualUser.filter(a => a.kind === 'operations-read');
    expect(opsInVirtual).toHaveLength(0);
  });

  it('reports the split for evidence', () => {
    const described = describeGenerationPlan(plan);
    expect(described.browserSessions).toBe(plan.browser.length);
    expect(described.virtualUserSessions).toBe(plan.virtualUser.length);
    expect(described.browserSessions + described.virtualUserSessions).toBe(assignments.length);
  });

  it('puts everything on browsers when no readers may be virtualised', () => {
    const all = planGeneration(assignments, { browserReaderSample: assignments.length });
    expect(all.virtualUser).toHaveLength(0);
    expect(all.browser).toHaveLength(assignments.length);
  });

  it.each([-1, 1.5])('rejects an invalid sample size: %s', sample => {
    expect(() => planGeneration(assignments, { browserReaderSample: sample })).toThrow(
      /non-negative integer/
    );
  });
});
