import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PlatformObservation } from './loadEvaluation';

export interface LoadPlatformArtifact {
  schemaVersion: 1;
  runId: string;
  startAtMs: number;
  platform: PlatformObservation;
}

/**
 * The sampler is not a shard, so it must not borrow `loadShardFromEnv`: that
 * throws a shard-worded "missed the synchronized start" before this job's own
 * fail-closed checks can run, sending an operator looking for a missing shard.
 */
export function loadPlatformRunFromEnv(env: NodeJS.ProcessEnv): {
  runId: string;
  startAtMs: number;
} {
  const runId = env.LOAD_TEST_RUN_ID ?? '';
  const startAtMs = Number(env.LOAD_TEST_START_AT);
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(runId)) {
    throw new Error('Platform telemetry run ID is missing or invalid.');
  }
  if (!Number.isSafeInteger(startAtMs) || startAtMs <= 0) {
    throw new Error('Platform telemetry start must be a valid Unix timestamp in milliseconds.');
  }
  return { runId, startAtMs };
}

/**
 * Absent, truncated, corrupt and mismatched telemetry all degrade identically:
 * the shards' evidence costs an operator-approved window against shared
 * staging, so it must survive, and the evaluator already fails closed on absent
 * telemetry. Aggregation still throws on a mismatched artifact, so this is the
 * only place allowed to forgive one.
 */
export function readUsablePlatformArtifact(
  path: string,
  run: { runId: string; startAtMs: number },
  onUnusable: (reason: string) => void = () => {}
): LoadPlatformArtifact | undefined {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as LoadPlatformArtifact;
    assertPlatformArtifactMatchesRun(parsed, run);
    assertPlatformPayload(parsed.platform);
    // Restore NaN at the boundary. `PlatformObservation` declares these as
    // `number`, and leaving null in place makes that type a lie: a later
    // Math.max or arithmetic would coerce null to 0 — the worst direction for a
    // peak. It also makes an in-process failure and a round-tripped one render
    // identically instead of as `NaN` versus `missing`.
    for (const key of ['peakCpuPercent', 'peakIoPercent', 'peakConnections'] as const) {
      if (parsed.platform[key] === null) parsed.platform[key] = Number.NaN;
    }
    return parsed;
  } catch (error) {
    onUnusable((error as Error).message);
    return undefined;
  }
}

/**
 * Matching identity is not enough. `evaluateLoadResult` dereferences
 * `statementDeltas.length` and `resourceSampling.failures.length` unguarded, so a
 * payload that parses but is structurally incomplete would throw there — after
 * this fallback has already accepted it, and before any evidence is written.
 */
function assertPlatformPayload(platform: PlatformObservation | undefined): void {
  const incomplete = new Error('Platform telemetry payload is incomplete.');
  if (!platform || typeof platform !== 'object') throw incomplete;
  // A peak may legitimately be NaN — that is the sampler failing closed, not
  // damage — and `JSON.stringify` writes NaN as `null`. Requiring `typeof
  // 'number'` here therefore threw away an otherwise-complete artifact in run
  // 33038456110, losing 20 valid statement deltas with it. Accept null, reject
  // anything else.
  for (const key of ['peakCpuPercent', 'peakIoPercent', 'peakConnections'] as const) {
    const value = platform[key];
    if (value !== null && typeof value !== 'number') throw incomplete;
  }
  // Not nullable: the cap is a verified scenario input, never a sampled value,
  // so it can never legitimately be NaN. Allowing null here would hand the
  // reader a PlatformObservation whose declared number is not one.
  if (typeof platform.connectionCap !== 'number') throw incomplete;
  if (!Array.isArray(platform.statementDeltas)) throw incomplete;
  const sampling = platform.resourceSampling;
  if (sampling !== undefined) {
    if (
      typeof sampling !== 'object' ||
      sampling === null ||
      typeof sampling.attempts !== 'number' ||
      typeof sampling.succeeded !== 'number' ||
      !Array.isArray(sampling.failures)
    ) {
      throw incomplete;
    }
  }
}

export function writeLoadPlatformArtifact(
  artifact: LoadPlatformArtifact,
  directory = resolve(process.env.LOAD_TEST_PLATFORM_OUTPUT_DIR ?? 'test-results/load-platform')
): string {
  mkdirSync(directory, { recursive: true });
  const outputPath = resolve(directory, 'platform.json');
  writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return outputPath;
}

/**
 * The sampler runs on its own runner, so nothing structurally ties its output to
 * the shards. Pair them explicitly or a stale artifact from an earlier rehearsal
 * would read as this run's telemetry.
 */
export function assertPlatformArtifactMatchesRun(
  artifact: LoadPlatformArtifact,
  run: { runId: string; startAtMs: number }
): void {
  if (artifact.schemaVersion !== 1) {
    throw new Error('Platform telemetry artifact schema is not supported.');
  }
  if (artifact.runId !== run.runId || artifact.startAtMs !== run.startAtMs) {
    throw new Error('Platform telemetry artifact does not belong to this rehearsal.');
  }
}
