import {
  G9_NORMAL_SCENARIO,
  scenarioRingsideSessionCount,
  scenarioSessionCount,
  type LoadScenario,
  type LoadWorkload,
} from './loadScenario';
import { DISTRIBUTED_G9_SHARD_COUNT } from './loadShard';

/**
 * Stepped-down rehearsal sizes (MYK9-1271).
 *
 * The full G9 workload is 358 sessions. A smaller size exists so a run can find
 * the largest size the platform survives instead of discovering the cliff at
 * 358. Every size keeps the 358 mix proportional, so a pass at 100 says the same
 * thing about the SHAPE of load as a pass at 358 says about its volume.
 *
 * Rounding rule (largest remainder, deterministic):
 *   1. quota = workload sessions * size / 358.
 *   2. Every workload keeps at least one session, so no required surface
 *      (scoring, correction, check-in, class edit, either reader, operations)
 *      silently disappears at a small size.
 *   3. Seats are then settled to the exact size: surplus seats go to the largest
 *      fractional remainders, a deficit is taken from the workloads furthest
 *      over their quota. Ties break by workload order.
 *
 * Placement is unchanged: fewer scorers than rings means the FIRST rings are
 * scored (the eight-ring show first), so a small run concentrates on the show
 * that is the real contention hot spot rather than thinning every show.
 */
export const G9_SESSION_SIZES = [50, 100, 200, 358] as const;
export type G9SessionSize = (typeof G9_SESSION_SIZES)[number];

/** Env var the workflow's `sessions` input is threaded through. */
export const LOAD_SESSIONS_ENV = 'LOAD_TEST_SESSIONS';

/** Every shard needs at least one session or its runner measures nothing. */
export const MIN_SESSIONS = DISTRIBUTED_G9_SHARD_COUNT;

export function isG9SessionSize(value: number): value is G9SessionSize {
  return (G9_SESSION_SIZES as readonly number[]).includes(value);
}

/** Sessions per shard under the round-robin `sequence % shardCount` split. */
export function shardSessionCounts(
  totalSessions: number,
  shardCount = DISTRIBUTED_G9_SHARD_COUNT
): number[] {
  return Array.from(
    { length: shardCount },
    (_, index) =>
      Math.floor(totalSessions / shardCount) + (index < totalSessions % shardCount ? 1 : 0)
  );
}

/** Workload session counts scaled to `size`, in workload order. */
export function scaleWorkloadSessions(sessions: readonly number[], size: number): number[] {
  const total = sessions.reduce((sum, count) => sum + count, 0);
  if (!Number.isInteger(size) || size < sessions.length || size > total) {
    throw new Error(`Session size ${size} must be an integer from ${sessions.length} to ${total}.`);
  }
  const quotas = sessions.map(count => (count * size) / total);
  const seats = quotas.map(quota => Math.max(1, Math.floor(quota)));
  let difference = size - seats.reduce((sum, count) => sum + count, 0);
  while (difference !== 0) {
    const order = seats
      .map((count, index) => ({ index, remainder: quotas[index] - count }))
      .filter(item => difference > 0 || seats[item.index] > 1)
      .sort((left, right) =>
        difference > 0
          ? right.remainder - left.remainder || left.index - right.index
          : left.remainder - right.remainder || left.index - right.index
      );
    const step = Math.min(Math.abs(difference), order.length);
    for (const item of order.slice(0, step)) seats[item.index] += Math.sign(difference);
    difference -= Math.sign(difference) * step;
  }
  return seats;
}

/**
 * The base scenario at a stepped-down size. At the full size this returns the
 * base scenario itself, so the 358 contract cannot drift from this path.
 *
 * Latency and error targets are never touched. Only `throughputMin`, which is a
 * count of requests per second and therefore moves with how many sessions issue
 * them, scales (it is a pending-derivation target, not a gate). A reduced run is
 * `informational`: it can never claim the G9 gate.
 */
export function scaleScenarioToSessions(base: LoadScenario, size: number): LoadScenario {
  const total = scenarioSessionCount(base);
  if (size === total) return base;
  const seats = scaleWorkloadSessions(
    base.workloads.map(workload => workload.sessions),
    size
  );
  const workloads: LoadWorkload[] = base.workloads.map((workload, index) =>
    Object.freeze({ ...workload, sessions: seats[index] })
  );
  const scaled: LoadScenario = {
    ...base,
    name: `${base.name} (${size} of ${total} sessions)`,
    informational: true,
    workloads: Object.freeze(workloads),
    targets: Object.freeze({
      ...base.targets,
      throughputMin: Math.round((base.targets.throughputMin * size * 100) / total) / 100,
      ringsideSessionsExact: 0,
    }),
  };
  const ringside = scenarioRingsideSessionCount(scaled);
  return Object.freeze({
    ...scaled,
    targets: Object.freeze({ ...scaled.targets, ringsideSessionsExact: ringside }),
  });
}

export function parseSessionSize(env: NodeJS.ProcessEnv): G9SessionSize {
  const raw = env[LOAD_SESSIONS_ENV];
  if (raw === undefined || raw === '')
    return scenarioSessionCount(G9_NORMAL_SCENARIO) as G9SessionSize;
  const size = Number(raw);
  if (!isG9SessionSize(size)) {
    throw new Error(
      `${LOAD_SESSIONS_ENV} must be one of ${G9_SESSION_SIZES.join(', ')}; received "${raw}".`
    );
  }
  return size;
}

export function loadScenarioFromEnv(env: NodeJS.ProcessEnv): LoadScenario {
  return scaleScenarioToSessions(G9_NORMAL_SCENARIO, parseSessionSize(env));
}
