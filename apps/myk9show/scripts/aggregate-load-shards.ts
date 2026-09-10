import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildLoadEvidence, writeLoadEvidence } from '../src/test/load/loadEvidence';
import { readUsablePlatformArtifact } from '../src/test/load/loadPlatformArtifact';
import { evaluateLoadResult } from '../src/test/load/loadEvaluation';
import {
  aggregateLoadShardArtifacts,
  assertShardArtifactCount,
  type LoadShardArtifact,
  shardWindowDivergence,
} from '../src/test/load/loadShardAggregation';
import { G9_NORMAL_SCENARIO } from '../src/test/load/loadScenario';

function shardNumber(fileName: string): number {
  return Number(fileName.replace(/\D/g, ''));
}

function failureShardNumber(fileName: string): number {
  return fileName.includes('unknown') ? Number.POSITIVE_INFINITY : shardNumber(fileName);
}

const inputDirectory = resolve(
  process.argv[2] ?? process.env.LOAD_TEST_SHARD_INPUT_DIR ?? 'test-results/load-shards'
);
const artifactPaths = readdirSync(inputDirectory)
  .filter(fileName => /^shard-\d+\.json$/.test(fileName))
  // Numeric, not lexicographic: past nine shards a plain sort orders these
  // 0, 1, 10, 11, ... 2, which reorders the evidence a reader compares by index.
  .sort((left, right) => shardNumber(left) - shardNumber(right))
  .map(fileName => resolve(inputDirectory, fileName));
const parseDiagnostics: string[] = [];
const artifacts = artifactPaths.flatMap(artifactPath => {
  try {
    return [JSON.parse(readFileSync(artifactPath, 'utf8')) as LoadShardArtifact];
  } catch {
    parseDiagnostics.push(`${artifactPath}: unreadable observation artifact`);
    return [];
  }
});
const failureDiagnostics = readdirSync(inputDirectory)
  .filter(fileName => /^shard-(?:\d+|unknown)-failure\.json$/.test(fileName))
  .sort((left, right) => failureShardNumber(left) - failureShardNumber(right))
  .map(fileName => {
    try {
      const failure = JSON.parse(readFileSync(resolve(inputDirectory, fileName), 'utf8')) as {
        shard?: { index?: number };
        error?: { message?: string };
      };
      const shardLabel =
        failure.shard?.index === undefined || failure.shard.index < 0
          ? fileName
          : `shard ${failure.shard.index}`;
      return `${shardLabel}: ${failure.error?.message ?? 'unknown failure'}`;
    } catch {
      return `${fileName}: unreadable failure artifact`;
    }
  });
try {
  assertShardArtifactCount(artifacts);
} catch (error) {
  const diagnostics = [...parseDiagnostics, ...failureDiagnostics];
  if (diagnostics.length > 0 && error instanceof Error) {
    error.message += ` Failure diagnostics: ${diagnostics.join('; ')}`;
  }
  throw error;
}
const platformPath = resolve(
  process.env.LOAD_TEST_PLATFORM_INPUT_DIR ?? 'test-results/load-platform',
  'platform.json'
);
// Unusable telemetry must not destroy the shards' evidence, which costs an
// operator-approved window against shared staging. Absent, truncated, corrupt and
// mismatched all degrade the same way: drop it, and let the evaluator record the
// missing telemetry as a G9 failure. Pairing is checked here rather than left to
// aggregation, which throws by design so no caller can count a stale artifact.
const platformArtifact = readUsablePlatformArtifact(
  platformPath,
  { runId: artifacts[0].runId, startAtMs: artifacts[0].startAtMs },
  reason =>
    console.warn(
      `Platform telemetry at ${platformPath} is unusable (${reason}); evaluating without it.`
    )
);
const aggregate = aggregateLoadShardArtifacts(artifacts, G9_NORMAL_SCENARIO, platformArtifact);
const evaluation = evaluateLoadResult(G9_NORMAL_SCENARIO, aggregate.observation);
// Aggregating shards that measured different windows produces one percentile
// over incommensurable samples. Appended rather than folded into
// evaluateLoadResult because only the aggregate sees the per-shard windows
// (MYK9-126).
const windowDivergence = shardWindowDivergence(artifacts.map(artifact => artifact.elapsedMs));
if (windowDivergence) {
  evaluation.failures.push(windowDivergence);
  evaluation.passed = false;
}
const evidence = buildLoadEvidence({
  target: aggregate.target,
  scenario: G9_NORMAL_SCENARIO,
  observation: aggregate.observation,
  evaluation,
});
const paths = writeLoadEvidence(evidence);

console.log(
  JSON.stringify(
    {
      result: evaluation.passed ? 'PASS' : 'FAIL',
      shardCount: artifacts.length,
      evidence: paths,
      failures: evaluation.failures,
    },
    null,
    2
  )
);
if (!evaluation.passed) process.exitCode = 1;
