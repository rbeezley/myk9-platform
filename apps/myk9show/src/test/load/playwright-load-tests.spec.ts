import { expect, test } from '@playwright/test';
import { runBrowserLoad } from './loadBrowserRunner';
import { buildLoadEvidence, renderLoadEvidenceMarkdown, writeLoadEvidence } from './loadEvidence';
import { evaluateLoadResult } from './loadEvaluation';
import { G9_NORMAL_SCENARIO } from './loadScenario';
import { loadShardFromEnv } from './loadShard';
import { buildLoadShardArtifact, writeLoadShardArtifact } from './loadShardAggregation';
import { loadTargetFromEnv } from './loadTarget';

test('G9 Normal show-day load', async ({ browser }, testInfo) => {
  test.skip(process.env.LOAD_TEST_MODE === 'discovery', 'Discovery lists this test without load.');
  const target = loadTargetFromEnv(process.env);
  const shard = loadShardFromEnv(process.env);
  const result = await runBrowserLoad(browser, G9_NORMAL_SCENARIO, target, { shard });
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
