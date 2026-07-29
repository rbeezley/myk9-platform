import type { LoadSessionAssignment } from './loadAssignments';

const REQUIRED_SHARD_COUNT = 4;
const MAX_START_LATENESS_MS = 5_000;
const SHARD_ENV_KEYS = [
  'LOAD_TEST_SHARD_COUNT',
  'LOAD_TEST_SHARD_INDEX',
  'LOAD_TEST_RUN_ID',
  'LOAD_TEST_START_AT',
] as const;

export interface LoadShard {
  count: number;
  index: number;
  runId: string;
  startAtMs: number;
}

export function loadShardFromEnv(
  env: NodeJS.ProcessEnv,
  nowMs = Date.now()
): LoadShard | undefined {
  const provided = SHARD_ENV_KEYS.filter(key => env[key] !== undefined);
  if (provided.length === 0) return undefined;
  if (provided.length !== SHARD_ENV_KEYS.length) {
    throw new Error('Distributed load configuration is incomplete.');
  }

  const count = Number(env.LOAD_TEST_SHARD_COUNT);
  const index = Number(env.LOAD_TEST_SHARD_INDEX);
  const runId = env.LOAD_TEST_RUN_ID ?? '';
  const startAtMs = Number(env.LOAD_TEST_START_AT);
  if (count !== REQUIRED_SHARD_COUNT) {
    throw new Error(`Distributed G9 load requires exactly ${REQUIRED_SHARD_COUNT} shards.`);
  }
  if (!Number.isInteger(index) || index < 0 || index >= count) {
    throw new Error('Distributed load shard index is outside the configured range.');
  }
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(runId)) {
    throw new Error('Distributed load run ID is missing or invalid.');
  }
  if (!Number.isSafeInteger(startAtMs) || startAtMs <= 0) {
    throw new Error('Distributed load start must be a valid Unix timestamp in milliseconds.');
  }
  const shard = { count, index, runId, startAtMs };
  scheduledStartDelayMs(shard, nowMs);
  return shard;
}

export function selectShardAssignments(
  assignments: readonly LoadSessionAssignment[],
  shard: Pick<LoadShard, 'count' | 'index'>
): LoadSessionAssignment[] {
  return assignments.filter(assignment => assignment.sequence % shard.count === shard.index);
}

export function scheduledStartDelayMs(shard: LoadShard, nowMs = Date.now()): number {
  const latenessMs = nowMs - shard.startAtMs;
  if (latenessMs > MAX_START_LATENESS_MS) {
    throw new Error(
      `Load shard missed the synchronized start by ${latenessMs} ms; refusing incomplete load.`
    );
  }
  return Math.max(0, shard.startAtMs - nowMs);
}
