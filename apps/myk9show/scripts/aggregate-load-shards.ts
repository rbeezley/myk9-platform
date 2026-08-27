import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildLoadEvidence, writeLoadEvidence } from '../src/test/load/loadEvidence';
import { readUsablePlatformArtifact } from '../src/test/load/loadPlatformArtifact';
import { evaluateLoadResult } from '../src/test/load/loadEvaluation';
import {
  aggregateLoadShardArtifacts,
  type LoadShardArtifact,
} from '../src/test/load/loadShardAggregation';
import { G9_NORMAL_SCENARIO } from '../src/test/load/loadScenario';

const inputDirectory = resolve(
  process.argv[2] ?? process.env.LOAD_TEST_SHARD_INPUT_DIR ?? 'test-results/load-shards'
);
const artifactPaths = readdirSync(inputDirectory)
  .filter(fileName => /^shard-\d+\.json$/.test(fileName))
  .sort()
  .map(fileName => resolve(inputDirectory, fileName));
const artifacts = artifactPaths.map(
  artifactPath => JSON.parse(readFileSync(artifactPath, 'utf8')) as LoadShardArtifact
);
const platformPath = resolve(
  process.env.LOAD_TEST_PLATFORM_INPUT_DIR ?? 'test-results/load-platform',
  'platform.json'
);
// Unusable telemetry must not destroy the eight shards' evidence, which costs an
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
