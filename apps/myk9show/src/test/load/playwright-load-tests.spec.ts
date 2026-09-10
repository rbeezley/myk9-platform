import { expect, test } from '@playwright/test';
import { runBrowserLoad } from './loadBrowserRunner';
import { buildLoadEvidence, renderLoadEvidenceMarkdown, writeLoadEvidence } from './loadEvidence';
import { evaluateLoadResult } from './loadEvaluation';
import { G9_NORMAL_SCENARIO } from './loadScenario';
import { loadShardFromEnv } from './loadShard';
import {
  buildLoadShardArtifact,
  writeLoadShardArtifact,
  writeLoadShardFailureArtifact,
} from './loadShardAggregation';
import { loadTargetFromEnv } from './loadTarget';

test('G9 Normal show-day load', async ({ browser }, testInfo) => {
  test.skip(process.env.LOAD_TEST_MODE === 'discovery', 'Discovery lists this test without load.');
  let target!: ReturnType<typeof loadTargetFromEnv>;
  let shard!: ReturnType<typeof loadShardFromEnv>;
  let result: Awaited<ReturnType<typeof runBrowserLoad>>;
  try {
    target = loadTargetFromEnv(process.env);
    shard = loadShardFromEnv(process.env);
    result = await runBrowserLoad(browser, G9_NORMAL_SCENARIO, target, { shard });
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    const fallbackShard = {
      count: Number(process.env.LOAD_TEST_SHARD_COUNT ?? 0),
      index: Number(process.env.LOAD_TEST_SHARD_INDEX),
    };
    const fallbackIndex = Number.isInteger(fallbackShard.index) && fallbackShard.index >= 0;
    const failureFileName =
      process.env.LOAD_TEST_SHARD_FAILURE_FILE ??
      (fallbackIndex ? `shard-${fallbackShard.index}-failure.json` : 'shard-unknown-failure.json');
    const failureArtifact = {
      schemaVersion: 1 as const,
      runId: shard?.runId ?? process.env.LOAD_TEST_RUN_ID ?? 'unknown',
      startAtMs: shard?.startAtMs ?? Number(process.env.LOAD_TEST_START_AT ?? 0),
      shard: shard
        ? { count: shard.count, index: shard.index }
        : { count: fallbackShard.count, index: fallbackIndex ? fallbackShard.index : -1 },
      target,
      scenarioId: G9_NORMAL_SCENARIO.id,
      error: {
        name: failure.name,
        message: failure.message,
        ...(failure.stack ? { stack: failure.stack } : {}),
      },
    };
    try {
      const artifactPath = writeLoadShardFailureArtifact(
        failureArtifact,
        undefined,
        failureFileName
      );
      await testInfo.attach('load-shard-failure.json', {
        body: JSON.stringify(failureArtifact, null, 2),
        contentType: 'text/plain',
      });
      testInfo.annotations.push({ type: 'shard-failure-evidence', description: artifactPath });
    } catch (diagnosticError) {
      testInfo.annotations.push({
        type: 'shard-failure-diagnostics-error',
        description:
          diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError),
      });
      console.error('Load shard failure diagnostics could not be written:', diagnosticError);
    }
    throw failure;
  }
  if (shard) {
    const artifact = buildLoadShardArtifact({
      shard,
      target,
      scenario: G9_NORMAL_SCENARIO,
      result,
    });
    const artifactPath = writeLoadShardArtifact(artifact);
    await testInfo.attach('load-shard-observation.json', {
      body: JSON.stringify(artifact, null, 2),
      contentType: 'application/json',
    });
    testInfo.annotations.push({ type: 'shard-evidence', description: artifactPath });
    return;
  }

  const observation = result.observation;
  const evaluation = evaluateLoadResult(G9_NORMAL_SCENARIO, observation);
  const evidence = buildLoadEvidence({
    target,
    scenario: G9_NORMAL_SCENARIO,
    observation,
    evaluation,
  });
  const evidencePaths = writeLoadEvidence(evidence);

  await testInfo.attach('load-observation.json', {
    body: JSON.stringify(evidence, null, 2),
    contentType: 'application/json',
  });
  await testInfo.attach('load-observation.md', {
    body: renderLoadEvidenceMarkdown(evidence),
    contentType: 'text/markdown',
  });
  testInfo.annotations.push({
    type: 'evidence',
    description: `${evidencePaths.jsonPath}; ${evidencePaths.markdownPath}`,
  });

  expect(evaluation.failures, evaluation.failures.join('\n')).toEqual([]);
  expect(evaluation.passed).toBe(true);
});

test('bounded approved-target show-day load smoke', async ({ browser }, testInfo) => {
  test.skip(process.env.LOAD_TEST_MODE === 'discovery', 'Discovery lists this test without load.');
  const target = loadTargetFromEnv(process.env);
  const result = await runBrowserLoad(browser, G9_NORMAL_SCENARIO, target, { smoke: true });
  const observation = result.observation;

  await testInfo.attach('load-smoke-observation.json', {
    body: JSON.stringify({ target, observation }, null, 2),
    contentType: 'application/json',
  });

  expect(observation.concurrentSessions).toBe(5);
  expect(observation.ringsideSessions).toBe(1);
  expect(observation.expectedPersistedScores).toBe(1);
  expect(observation.persistedScores).toBe(1);
  expect(observation.finalReplicationQueueDepth).toBe(0);
  expect(observation.queueTelemetryFailures).toBe(0);
});
