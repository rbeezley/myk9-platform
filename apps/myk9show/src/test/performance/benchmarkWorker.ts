import { writeFileSync, renameSync } from 'node:fs';
import { benchmarkRoutesFor } from './benchmarkRoutes';
import { measurePair } from './benchmarkAttempt';
import type { NetworkProfile } from './benchmarkReport';
import type { PairResult } from './benchmarkRun';
import type { Session } from '@supabase/supabase-js';

async function main(): Promise<void> {
  const spec = JSON.parse(process.env.MYK9_PERF_PAIR ?? '{}') as {
    runId: string;
    buildRef: string;
    showId: string;
    routeId: string;
    profile: NetworkProfile;
    repeat: number;
    output: string;
  };
  const route = benchmarkRoutesFor(spec.showId).find(candidate => candidate.id === spec.routeId);
  if (!route || !spec.output || !spec.runId) throw new Error('Invalid benchmark pair');
  const session = process.env.MYK9_PERF_SESSION
    ? (JSON.parse(process.env.MYK9_PERF_SESSION) as Session)
    : null;
  const samples = await measurePair(route, spec.profile, spec.repeat, session);
  const result: PairResult = {
    runId: spec.runId,
    buildRef: spec.buildRef,
    showId: spec.showId,
    routeId: spec.routeId,
    profile: spec.profile,
    repeat: spec.repeat,
    samples,
  };
  writeFileSync(`${spec.output}.tmp`, JSON.stringify(result));
  renameSync(`${spec.output}.tmp`, spec.output);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
