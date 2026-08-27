import { writeLoadPlatformArtifact } from '../src/test/load/loadPlatformArtifact';
import { startLoadPlatformSampler } from '../src/test/load/loadPlatformSampler';
import { platformSamplingWindow } from '../src/test/load/loadPlatformWindow';
import { G9_NORMAL_SCENARIO } from '../src/test/load/loadScenario';
import { loadShardFromEnv } from '../src/test/load/loadShard';

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

// Reuses the shard env contract so the sampler is validated against, and pinned
// to, the same synchronized start the eight load shards wait for.
const shard = loadShardFromEnv(process.env);
if (!shard) {
  throw new Error('Platform sampling requires the distributed load configuration.');
}

const window = platformSamplingWindow({
  startAtMs: shard.startAtMs,
  durationMs: G9_NORMAL_SCENARIO.durationMs,
  nowMs: Date.now(),
});

await delay(window.baselineDelayMs);
const sampler = await startLoadPlatformSampler(
  process.env,
  G9_NORMAL_SCENARIO.targets.databaseConnectionCap
);
await delay(Math.max(0, window.stopAtMs - Date.now()));
const platform = await sampler.stop();

const outputPath = writeLoadPlatformArtifact({
  schemaVersion: 1,
  runId: shard.runId,
  startAtMs: shard.startAtMs,
  platform,
});

console.log(
  JSON.stringify(
    {
      artifact: outputPath,
      peakCpuPercent: platform.peakCpuPercent,
      peakIoPercent: platform.peakIoPercent,
      peakConnections: platform.peakConnections,
      connectionCap: platform.connectionCap,
      statementDeltas: platform.statementDeltas.length,
      resourceSampling: platform.resourceSampling,
    },
    null,
    2
  )
);
