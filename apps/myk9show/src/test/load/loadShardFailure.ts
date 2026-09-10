import type { TestInfo } from '@playwright/test';
import { G9_NORMAL_SCENARIO } from './loadScenario';
import { writeLoadShardFailureArtifact } from './loadShardAggregation';
import { loadTargetFromEnv } from './loadTarget';

function parseNonnegativeInteger(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

export function sanitizeFailureMessage(message: string): string {
  return message
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]')
    .replace(
      /\b(?:authorization|cookie|password|secret|token|api[_-]?key)\b\s*[:=]\s*[^\s&]+/gi,
      match => `${match.slice(0, match.search(/[:=]/))}[REDACTED]`
    )
    .replace(/([?&][^=\s&]+)=([^&\s]*)/g, '$1=[REDACTED]')
    .slice(0, 2000);
}

export function failureArtifactMetadata(env: NodeJS.ProcessEnv): {
  shard: { count: number; index: number };
  fileName: string;
} {
  const index = parseNonnegativeInteger(env.LOAD_TEST_SHARD_INDEX);
  const count = parseNonnegativeInteger(env.LOAD_TEST_SHARD_COUNT) ?? 0;
  return {
    shard: { count, index: index ?? -1 },
    fileName: env.LOAD_TEST_SHARD_FAILURE_FILE ?? `shard-${index ?? 'unknown'}-failure.json`,
  };
}

export async function writeFailureArtifactFromTestInfo(
  testInfo: TestInfo,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  if (testInfo.status === testInfo.expectedStatus) return;
  if (env.LOAD_TEST_SHARD_INDEX === undefined) return;
  if (testInfo.title !== 'G9 Normal show-day load') return;
  if (testInfo.annotations.some(annotation => annotation.type === 'shard-failure-evidence')) return;
  const metadata = failureArtifactMetadata(env);
  const target = (() => {
    try {
      return loadTargetFromEnv(env);
    } catch {
      return undefined;
    }
  })();
  const failure = testInfo.error;
  const artifact = {
    schemaVersion: 1 as const,
    runId: env.LOAD_TEST_RUN_ID ?? 'unknown',
    startAtMs: Number(env.LOAD_TEST_START_AT ?? 0),
    shard: metadata.shard,
    target,
    scenarioId: G9_NORMAL_SCENARIO.id,
    error: {
      name: 'PlaywrightTestError',
      message: sanitizeFailureMessage(
        failure?.message ?? `Load test ended with status ${testInfo.status}.`
      ),
    },
  };
  try {
    const artifactPath = writeLoadShardFailureArtifact(artifact, undefined, metadata.fileName);
    await testInfo.attach('load-shard-failure.json', {
      body: JSON.stringify(artifact, null, 2),
      contentType: 'text/plain',
    });
    testInfo.annotations.push({ type: 'shard-failure-evidence', description: artifactPath });
  } catch (error) {
    console.error('Load shard timeout diagnostics could not be written:', error);
  }
}
