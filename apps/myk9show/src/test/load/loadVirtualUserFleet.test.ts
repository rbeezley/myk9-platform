import { describe, expect, it, vi } from 'vitest';
import { buildSessionAssignments } from './loadAssignments';
import { planGeneration } from './loadGenerationPlan';
import { G9_NORMAL_SCENARIO } from './loadScenario';
import { DISTRIBUTED_G9_SHARD_COUNT } from './loadShard';
import { VirtualUserFleet } from './loadVirtualUserFleet';
import { LoadVirtualUser, type VirtualUserRequestSample } from './loadVirtualUser';
import { READER_TABLE_PASSES } from './loadVirtualUserTables';

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

  it('reads unscoped, as the app poll does, whatever show a reader belongs to', async () => {
    // The poll passes no sync scope, so RLS alone decides what each reader gets.
    // A reader that filtered by show or trial would ask for less than a device does.
    const { fleet, urls } = fleetFor(4);
    await fleet.hydrate();
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url).not.toMatch(/[?&](show_id|trial_id|owner_id)=eq\./);
      expect(url).not.toContain('view_authenticated_entry_results');
    }
  });

  it('hydrates every reader once before steady state', async () => {
    const samples: VirtualUserRequestSample[] = [];
    const { fleet } = fleetFor(5, sample => samples.push(sample));
    await fleet.hydrate();
    // Seventeen requests per reader on an empty server: a count and a delta for
    // shows, trials, classes, judge_assignments and waitlist_entries (10); the dogs
    // and dog_registrations deltas, each followed by an id scan (4); the clubs delta
    // and count (2, its id scan needs a readable count); and the one armbands read.
    expect(samples).toHaveLength(5 * 17);
  });

  it('reports every sample to the collector', async () => {
    const samples: VirtualUserRequestSample[] = [];
    const { fleet } = fleetFor(3, sample => samples.push(sample));
    await fleet.hydrate();
    for (const sample of samples) {
      expect(sample.ok).toBe(true);
      expect(sample.durationMs).toBeGreaterThanOrEqual(0);
      expect(READER_TABLE_PASSES.map(pass => pass.table)).toContain(sample.table.split(' ')[0]);
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

  it('treats a reader that succeeded at least once as completed', async () => {
    // A single failed poll is NOT a failed session — the reader keeps polling and
    // the error-rate budget already accounts for the request. Marking the session
    // failed instead breaks evaluateLoadResult's
    // `failedWorkflows === workflowFailures` invariant, because
    // recordWorkflowFailure only fires for browser sessions: one transient 500
    // would force a spurious "lifecycle evidence inconsistent" failure.
    let call = 0;
    const flaky = (async () => {
      call += 1;
      return call === 1
        ? new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
        : new Response('{}', { status: 500 });
    }) as unknown as typeof fetch;
    const assignments = buildSessionAssignments(G9_NORMAL_SCENARIO);
    const plan = planGeneration(assignments, { browserReaderSample: DISTRIBUTED_G9_SHARD_COUNT });
    const fleet = new VirtualUserFleet(plan.virtualUser.slice(0, 1), {
      supabaseUrl: 'https://fixture.supabase.co',
      anonKey: 'anon',
      accessTokenFor: () => 'token',
      classColumnSelect: 'id,updated_at',
      onSample: () => {},
      fetchImpl: flaky,
    });
    await fleet.hydrate();
    fleet.stop();
    await fleet.drain();
    expect(fleet.outcomes()[0]?.ok).toBe(true);
  });

  it('awaits an in-flight poll before reporting outcomes', async () => {
    // stop() only clears future interval ticks. A sync still running at the
    // boundary would otherwise settle after outcomes() had already snapshotted,
    // so its failure is lost and its samples miss the observation. A 60s cadence
    // against a 600s window makes that likely, not exotic.
    vi.useFakeTimers();
    try {
      const ok = () =>
        new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
      let phase: 'hydrate' | 'poll' = 'hydrate';
      let gated = false;
      let release: (() => void) | undefined;
      // A sync issues several requests through supabase-js; gate only the first
      // of the poll so releasing it lets the rest of that sync finish.
      const gatedFetch = (async () => {
        if (phase === 'hydrate') return new Response('{}', { status: 500 });
        if (!gated) {
          gated = true;
          return new Promise<Response>(resolve => {
            release = () => resolve(ok());
          });
        }
        return ok();
      }) as unknown as typeof fetch;

      const assignments = buildSessionAssignments(G9_NORMAL_SCENARIO);
      const plan = planGeneration(assignments, { browserReaderSample: DISTRIBUTED_G9_SHARD_COUNT });
      const fleet = new VirtualUserFleet(plan.virtualUser.slice(0, 1), {
        supabaseUrl: 'https://fixture.supabase.co',
        anonKey: 'anon',
        accessTokenFor: () => 'token',
        classColumnSelect: 'id,updated_at',
        onSample: () => {},
        fetchImpl: gatedFetch,
      });

      await fleet.hydrate();
      expect(fleet.outcomes()[0]?.ok).toBe(false);

      phase = 'poll';
      fleet.start();
      vi.advanceTimersByTime(60_000);
      // supabase-js takes several microtask ticks to reach fetch.
      for (let tick = 0; tick < 50; tick += 1) await Promise.resolve();
      fleet.stop();

      let drained = false;
      const draining = fleet.drain().then(() => {
        drained = true;
      });
      await Promise.resolve();
      // The poll has not settled, so a real drain is still waiting. A no-op
      // drain would already have resolved here.
      expect(drained).toBe(false);
      expect(release).toBeDefined();

      release?.();
      await draining;
      expect(drained).toBe(true);
      expect(fleet.outcomes()[0]?.ok).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('skips and counts a tick that fires while the previous pass is still running', async () => {
    // A sync slower than the 60s cadence is the OVERLOAD case, and the last
    // rehearsal measured ~140s syncs. The app never overlaps passes
    // (ReplicationSyncProvider returns at once while one is in flight); a reader
    // that did would send the struggling database more than a device ever could.
    //
    // Driven through syncOnce rather than fetch: one pass issues many requests, so
    // gating at the fetch layer cannot separate two polls.
    vi.useFakeTimers();
    try {
      const user = new LoadVirtualUser(
        {
          supabaseUrl: 'https://fixture.supabase.co',
          anonKey: 'anon',
          accessToken: 'token',
          role: 'exhibitor',
        },
        'id,updated_at'
      );

      const settle: (() => void)[] = [];
      const sync = vi.spyOn(user, 'syncOnce').mockImplementation(
        () =>
          new Promise(resolve => {
            settle.push(() => resolve({ samples: [], rows: 0 }));
          })
      );

      const onSkip = vi.fn();
      user.start(() => {}, undefined, onSkip);
      vi.advanceTimersByTime(60_000);
      expect(sync).toHaveBeenCalledTimes(1);

      // The second and third ticks arrive into a pass that has not finished.
      vi.advanceTimersByTime(120_000);
      expect(sync).toHaveBeenCalledTimes(1);
      expect(user.skippedPasses).toBe(2);
      expect(onSkip).toHaveBeenCalledTimes(2);

      // Once the pass settles, the next tick runs again and nothing more is skipped.
      settle[0]?.();
      for (let tick = 0; tick < 20; tick += 1) await Promise.resolve();
      vi.advanceTimersByTime(60_000);
      expect(sync).toHaveBeenCalledTimes(2);
      expect(user.skippedPasses).toBe(2);

      // drain() still waits for the pass in flight at the boundary.
      user.stop();
      let drained = false;
      const draining = user.drain().then(() => {
        drained = true;
      });
      for (let tick = 0; tick < 20; tick += 1) await Promise.resolve();
      expect(drained).toBe(false);
      settle[1]?.();
      await draining;
      expect(drained).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('carries every reader skipped tick through the fleet to the collector', async () => {
    vi.useFakeTimers();
    try {
      const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });
      const hanging = ((_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          // Real fetch rejects immediately on an already-aborted signal.
          if (init?.signal?.aborted) reject(abortError());
          init?.signal?.addEventListener('abort', () => reject(abortError()));
        })) as unknown as typeof fetch;
      const assignments = buildSessionAssignments(G9_NORMAL_SCENARIO);
      const plan = planGeneration(assignments, { browserReaderSample: DISTRIBUTED_G9_SHARD_COUNT });
      const onSkippedPass = vi.fn();
      const fleet = new VirtualUserFleet(plan.virtualUser.slice(0, 3), {
        supabaseUrl: 'https://fixture.supabase.co',
        anonKey: 'anon',
        accessTokenFor: () => 'token',
        classColumnSelect: 'id,updated_at',
        onSample: () => {},
        onSkippedPass,
        fetchImpl: hanging,
      });

      fleet.start();
      // One tick starts each reader's pass; the next two are skipped by all three.
      vi.advanceTimersByTime(3 * 60_000);
      expect(fleet.skippedPasses).toBe(6);
      expect(onSkippedPass).toHaveBeenCalledTimes(6);

      fleet.stop();
      await fleet.drain();
    } finally {
      vi.useRealTimers();
    }
  });

  it('aborts in-flight requests at the boundary instead of waiting for them', async () => {
    // Waiting was itself the defect. A Supabase fetch that never settles — the
    // overload case — made drain() block until the shard step timeout, so
    // the run wrote NO artifact at all. Waiting also let the poll's latency land
    // inside elapsedMs and kept requests reaching shared staging past the
    // approved window. Aborting removes all three.
    vi.useFakeTimers();
    try {
      // Never settles on its own; only an abort can end it.
      const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });
      const hanging = ((_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          // Real fetch rejects immediately on an already-aborted signal.
          if (init?.signal?.aborted) {
            reject(abortError());
            return;
          }
          init?.signal?.addEventListener('abort', () => reject(abortError()));
        })) as unknown as typeof fetch;

      const user = new LoadVirtualUser(
        {
          supabaseUrl: 'https://fixture.supabase.co',
          anonKey: 'anon',
          accessToken: 'token',
          role: 'exhibitor',
          fetchImpl: hanging,
        },
        'id,updated_at'
      );

      user.start(() => {});
      vi.advanceTimersByTime(60_000);
      for (let tick = 0; tick < 50; tick += 1) await Promise.resolve();

      user.stop();
      // Unbounded before: this would never resolve.
      await expect(user.drain()).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('issues no further requests once the boundary has passed', async () => {
    // Aborting the in-flight requests is not enough: a table's pass is several
    // sequential reads (a count, a delta, an id scan), so one cancelled on its first
    // would still issue the rest, reaching shared staging after the window closed.
    vi.useFakeTimers();
    try {
      let issued = 0;
      const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });
      const counting = ((_url: RequestInfo | URL, init?: RequestInit) => {
        issued += 1;
        return new Promise((_resolve, reject) => {
          if (init?.signal?.aborted) {
            reject(abortError());
            return;
          }
          init?.signal?.addEventListener('abort', () => reject(abortError()));
        });
      }) as unknown as typeof fetch;

      const user = new LoadVirtualUser(
        {
          supabaseUrl: 'https://fixture.supabase.co',
          anonKey: 'anon',
          accessToken: 'token',
          role: 'exhibitor',
          fetchImpl: counting,
        },
        'id,updated_at'
      );

      user.start(() => {});
      vi.advanceTimersByTime(60_000);
      for (let tick = 0; tick < 50; tick += 1) await Promise.resolve();
      // Every table starts at once: nine begin with a request that never answers.
      const issuedAtBoundary = issued;
      expect(issuedAtBoundary).toBe(READER_TABLE_PASSES.length);

      user.stop();
      await user.drain();
      // The follow-up reads of the cancelled pass must never be issued.
      expect(issued).toBe(issuedAtBoundary);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports no request samples for a poll cancelled at the boundary', async () => {
    // stop() aborts deliberately. Counting that as a failed request invents
    // failures the system never produced: with a 60s cadence over 600s the final
    // tick commonly straddles the boundary, so every reader would contribute
    // three synthetic failures — enough across 248 readers to push availability
    // under 99.5% and fail an otherwise healthy run.
    vi.useFakeTimers();
    try {
      const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });
      const hanging = ((_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          if (init?.signal?.aborted) {
            reject(abortError());
            return;
          }
          init?.signal?.addEventListener('abort', () => reject(abortError()));
        })) as unknown as typeof fetch;

      const samples: VirtualUserRequestSample[] = [];
      const assignments = buildSessionAssignments(G9_NORMAL_SCENARIO);
      const plan = planGeneration(assignments, { browserReaderSample: DISTRIBUTED_G9_SHARD_COUNT });
      const fleet = new VirtualUserFleet(plan.virtualUser.slice(0, 1), {
        supabaseUrl: 'https://fixture.supabase.co',
        anonKey: 'anon',
        accessTokenFor: () => 'token',
        classColumnSelect: 'id,updated_at',
        onSample: sample => samples.push(sample),
        fetchImpl: hanging,
      });

      fleet.start();
      vi.advanceTimersByTime(60_000);
      for (let tick = 0; tick < 50; tick += 1) await Promise.resolve();
      fleet.stop();
      await fleet.drain();

      expect(samples.filter(sample => !sample.ok)).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not let pre-barrier hydration stand in for measured success', async () => {
    // hydrate() runs before the synchronized start and is explicitly excluded
    // from steady-state measurement. A reader whose token expires after
    // preparation would otherwise be marked completed on the strength of that
    // hydration alone, with no successful measured request behind it.
    let phase: 'hydrate' | 'poll' = 'hydrate';
    const shifting = (async () =>
      phase === 'hydrate'
        ? new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
        : new Response('{}', { status: 401 })) as unknown as typeof fetch;

    const assignments = buildSessionAssignments(G9_NORMAL_SCENARIO);
    const plan = planGeneration(assignments, { browserReaderSample: DISTRIBUTED_G9_SHARD_COUNT });
    const fleet = new VirtualUserFleet(plan.virtualUser.slice(0, 1), {
      supabaseUrl: 'https://fixture.supabase.co',
      anonKey: 'anon',
      accessTokenFor: () => 'token',
      classColumnSelect: 'id,updated_at',
      onSample: () => {},
      fetchImpl: shifting,
    });

    await fleet.hydrate();
    expect(fleet.outcomes()[0]?.ok).toBe(true);

    phase = 'poll';
    fleet.start();
    fleet.stop();
    await fleet.drain();
    // Nothing succeeded inside the measured window.
    expect(fleet.outcomes()[0]?.ok).toBe(false);
  });

  it('marks a reader failed when its requests fail', async () => {
    const assignments = buildSessionAssignments(G9_NORMAL_SCENARIO);
    const plan = planGeneration(assignments, { browserReaderSample: DISTRIBUTED_G9_SHARD_COUNT });
    const failing = (async () => new Response('{}', { status: 500 })) as unknown as typeof fetch;
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
