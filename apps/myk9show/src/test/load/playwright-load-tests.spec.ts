import { expect, test } from '@playwright/test';
import type { TestInfo } from '@playwright/test';
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

function parseNonnegativeInteger(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function failureArtifactMetadata(): {
  shard: { count: number; index: number };
  fileName: string;
} {
  const index = parseNonnegativeInteger(process.env.LOAD_TEST_SHARD_INDEX);
  const count = parseNonnegativeInteger(process.env.LOAD_TEST_SHARD_COUNT) ?? 0;
  return {
    shard: { count, index: index ?? -1 },
    fileName:
      process.env.LOAD_TEST_SHARD_FAILURE_FILE ??
      (index === undefined ? 'shard-unknown-failure.json' : `shard-${index}-failure.json`),
  };
}

async function writeFailureArtifactFromTestInfo(testInfo: TestInfo): Promise<void> {
  if (testInfo.status === testInfo.expectedStatus) return;
  if (process.env.LOAD_TEST_SHARD_INDEX === undefined) return;
  if (testInfo.title !== 'G9 Normal show-day load') return;
  if (testInfo.annotations.some(annotation => annotation.type === 'shard-failure-evidence')) return;
  const metadata = failureArtifactMetadata();
  const target = (() => {
    try {
      return loadTargetFromEnv(process.env);
    } catch {
      return undefined;
    }
  })();
  const failure = testInfo.error;
  // Playwright serializes teardown errors without a name; the in-test catch
  // preserves the native Error name when that path is available.
  const failureName = 'PlaywrightTestError';
  const failureMessage = failure?.message ?? `Load test ended with status ${testInfo.status}.`;
  const failureStack = failure?.stack;
  const artifact = {
    schemaVersion: 1 as const,
    runId: process.env.LOAD_TEST_RUN_ID ?? 'unknown',
    startAtMs: Number(process.env.LOAD_TEST_START_AT ?? 0),
    shard: metadata.shard,
    target,
    scenarioId: G9_NORMAL_SCENARIO.id,
    error: {
      name: failureName,
      message: failureMessage,
      ...(failureStack ? { stack: failureStack } : {}),
    },
  };
  try {
    writeLoadShardFailureArtifact(artifact, undefined, metadata.fileName);
  } catch (error) {
    console.error('Load shard timeout diagnostics could not be written:', error);
  }
}

// Playwright requires an object pattern here; keeping it empty avoids resolving
// browser fixtures during teardown, including when browser startup failed.
// eslint-disable-next-line no-empty-pattern
test.afterEach(async ({}, testInfo) => {
  await writeFailureArtifactFromTestInfo(testInfo);
});

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
    const fallback = failureArtifactMetadata();
    const failureArtifact = {
      schemaVersion: 1 as const,
      runId: shard?.runId ?? process.env.LOAD_TEST_RUN_ID ?? 'unknown',
      startAtMs: shard?.startAtMs ?? Number(process.env.LOAD_TEST_START_AT ?? 0),
      shard: shard ? { count: shard.count, index: shard.index } : fallback.shard,
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
        fallback.fileName
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
