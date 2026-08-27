import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PlatformObservation } from './loadEvaluation';

export interface LoadPlatformArtifact {
  schemaVersion: 1;
  runId: string;
  startAtMs: number;
  platform: PlatformObservation;
}

export function writeLoadPlatformArtifact(
  artifact: LoadPlatformArtifact,
  directory = process.env.LOAD_TEST_PLATFORM_OUTPUT_DIR ??
    resolve(process.cwd(), 'test-results/load-platform')
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
