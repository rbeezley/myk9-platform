import {
  loadPlatformRunFromEnv,
  writeLoadPlatformArtifact,
} from '../src/test/load/loadPlatformArtifact';
import { startLoadPlatformSampler } from '../src/test/load/loadPlatformSampler';
import {
  assertBaselineBeforeStart,
  platformSamplingWindow,
} from '../src/test/load/loadPlatformWindow';
import { G9_NORMAL_SCENARIO } from '../src/test/load/loadScenario';

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

const run = loadPlatformRunFromEnv(process.env);
const scenarioDurationMs = G9_NORMAL_SCENARIO.durationMs;
const window = platformSamplingWindow({
  startAtMs: run.startAtMs,
  durationMs: scenarioDurationMs,
  nowMs: Date.now(),
});

// Prove the credentials and both transports work NOW. Without this, a typo'd
// secret or an unreachable pooler is discovered only after the barrier wait,
// burning the whole operator-approved rehearsal window before failing.
const preflight = await startLoadPlatformSampler(
  process.env,
  G9_NORMAL_SCENARIO.targets.databaseConnectionCap
);
await preflight.stop();

await delay(window.baselineDelayMs);
// The pre-sleep check cannot see a descheduled runner or a timer that wakes
// late, so revalidate against the clock we actually woke on.
platformSamplingWindow({
  startAtMs: run.startAtMs,
  durationMs: scenarioDurationMs,
  nowMs: Date.now(),
});
const sampler = await startLoadPlatformSampler(
  process.env,
  G9_NORMAL_SCENARIO.targets.databaseConnectionCap
);
// Acquiring the baseline is itself two round trips; fail closed if they spilled
// past the barrier rather than emitting telemetry that undercounts the load.
assertBaselineBeforeStart({ startAtMs: run.startAtMs, baselineCompletedAtMs: Date.now() });

await delay(Math.max(0, window.stopAtMs - Date.now()));
const platform = await sampler.stop();

const outputPath = writeLoadPlatformArtifact({
  schemaVersion: 1,
  runId: run.runId,
  startAtMs: run.startAtMs,
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
