import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildLoadEvidence, writeLoadEvidence } from '../src/test/load/loadEvidence';
import type { LoadPlatformArtifact } from '../src/test/load/loadPlatformArtifact';
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
// A missing sampler artifact must not destroy the eight shards' evidence; the
// evaluator already fails closed on absent telemetry.
let platformArtifact: LoadPlatformArtifact | undefined;
try {
  platformArtifact = JSON.parse(readFileSync(platformPath, 'utf8')) as LoadPlatformArtifact;
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  console.warn(`Platform telemetry artifact was absent at ${platformPath}.`);
}
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
