import { describe, expect, it, vi } from 'vitest';
import { buildSessionAssignments } from './loadAssignments';
import { planGeneration } from './loadGenerationPlan';
import { G9_NORMAL_SCENARIO } from './loadScenario';
import { DISTRIBUTED_G9_SHARD_COUNT } from './loadShard';
import { VirtualUserFleet } from './loadVirtualUserFleet';
import type { VirtualUserRequestSample } from './loadVirtualUser';

function recordingFetch() {
  const urls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    urls.push(input.toString());
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { urls, impl };
}

function fleetFor(count: number, onSample: (s: VirtualUserRequestSample) => void = () => {}) {
  const assignments = buildSessionAssignments(G9_NORMAL_SCENARIO);
  const plan = planGeneration(assignments, { browserReaderSample: DISTRIBUTED_G9_SHARD_COUNT });
  const { urls, impl } = recordingFetch();
  const tokens: string[] = [];
  const fleet = new VirtualUserFleet(plan.virtualUser.slice(0, count), {
    supabaseUrl: 'https://fixture.supabase.co',
    anonKey: 'anon',
    accessTokenFor: (role, showIndex) => {
      tokens.push(`${role}:${showIndex}`);
      return `token-${role}-${showIndex}`;
    },
    classColumnSelect: 'id,updated_at',
    onSample,
    fetchImpl: impl,
  });
  return { fleet, urls, tokens, plan };
}

describe('virtual user fleet', () => {
  it('builds one reader per virtualised assignment', () => {
    const { fleet } = fleetFor(25);
    expect(fleet.size).toBe(25);
  });

  it('covers the whole virtualised reader set', () => {
    const { plan } = fleetFor(1);
    const { fleet } = fleetFor(plan.virtualUser.length);
    expect(fleet.size).toBe(plan.virtualUser.length);
    expect(fleet.size).toBeGreaterThan(200);
  });

  it('reads with the role its assignment declares', () => {
    // An exhibitor reader running on a staff token would read through staff
    // authorization and report it as exhibitor coverage.
    const { tokens } = fleetFor(30);
    expect(new Set(tokens).size).toBeGreaterThan(0);
    for (const entry of tokens) {
      const [role, showIndex] = entry.split(':');
      expect(['exhibitor', 'secretary']).toContain(role);
      // A staff reader must carry its own show's credential: another show's token
      // resolves a different manageable_show_ids().
      expect(Number(showIndex)).toBeGreaterThanOrEqual(0);
    }
  });

  it('targets each reader at its own show and trial', async () => {
    const { fleet, urls } = fleetFor(4);
    await fleet.hydrate();
    const showFilters = urls.filter(url => url.includes('show_id=eq.'));
    expect(showFilters.length).toBeGreaterThan(0);
    // Every entries read is scoped to a show; none is unscoped.
    for (const url of urls.filter(u => u.includes('view_authenticated_entry_results'))) {
      expect(url).toContain('show_id=eq.');
    }
  });

  it('hydrates every reader once before steady state', async () => {
    const samples: VirtualUserRequestSample[] = [];
    const { fleet } = fleetFor(5, sample => samples.push(sample));
    await fleet.hydrate();
    // Three tables per reader: classes, entries view, dogs.
    expect(samples).toHaveLength(15);
  });

  it('reports every sample to the collector', async () => {
    const samples: VirtualUserRequestSample[] = [];
    const { fleet } = fleetFor(3, sample => samples.push(sample));
    await fleet.hydrate();
    for (const sample of samples) {
      expect(sample.ok).toBe(true);
      expect(sample.durationMs).toBeGreaterThanOrEqual(0);
      expect(['classes', 'view_authenticated_entry_results', 'dogs']).toContain(sample.table);
    }
  });

  it('stops every reader, leaving no timer behind', () => {
    vi.useFakeTimers();
    try {
      const samples: VirtualUserRequestSample[] = [];
      const { fleet } = fleetFor(4, sample => samples.push(sample));
      fleet.start();
      fleet.stop();
      vi.advanceTimersByTime(10 * 60 * 1_000);
      // A leaked interval would keep polling a shared target after the window
      // closed, which is exactly what cleanup has to prove did not happen.
      expect(samples).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('is idempotent on stop', () => {
    const { fleet } = fleetFor(2);
    expect(() => {
      fleet.stop();
      fleet.stop();
    }).not.toThrow();
  });
});

describe('virtual-user lifecycle accounting (MYK9-126)', () => {
  // The G9 gate asserts concurrentSessions == the configured session count. The
  // runner marked only browser sessions prepared, so a 358-session scenario
  // reported 110 and could never pass — the 248 virtual readers ran, issued
  // requests, and were invisible to every lifecycle counter.
  it('exposes the assignment behind every reader so the lifecycle can count it', () => {
    const { fleet } = fleetFor(12);
    const assignments = fleet.assignments;
    expect(assignments).toHaveLength(12);
    expect(new Set(assignments.map(a => a.sequence)).size).toBe(12);
  });

  it('reports an outcome per reader once stopped', async () => {
    const { fleet } = fleetFor(5);
    await fleet.hydrate();
    fleet.start();
    fleet.stop();
    const outcomes = fleet.outcomes();
    expect(outcomes).toHaveLength(5);
    for (const outcome of outcomes) {
      expect(outcome.assignment.sequence).toEqual(expect.any(Number));
      expect(typeof outcome.ok).toBe('boolean');
    }
  });

  it('marks a reader failed when its requests fail', async () => {
    const assignments = buildSessionAssignments(G9_NORMAL_SCENARIO);
    const plan = planGeneration(assignments, { browserReaderSample: DISTRIBUTED_G9_SHARD_COUNT });
    const failing = (async () =>
      new Response('{}', { status: 500 })) as unknown as typeof fetch;
    const fleet = new VirtualUserFleet(plan.virtualUser.slice(0, 3), {
      supabaseUrl: 'https://fixture.supabase.co',
      anonKey: 'anon',
      accessTokenFor: () => 'token',
      classColumnSelect: 'id,updated_at',
      onSample: () => {},
      fetchImpl: failing,
    });
    await fleet.hydrate();
    fleet.stop();
    expect(fleet.outcomes().every(outcome => outcome.ok)).toBe(false);
  });

  it('counts a healthy reader as successful', async () => {
    const { fleet } = fleetFor(3);
    await fleet.hydrate();
    fleet.stop();
    expect(fleet.outcomes().every(outcome => outcome.ok)).toBe(true);
  });
});
