import type { ScheduledWriteDelta } from './loadEvaluation';

export type ScheduledWriteSnapshot = ReadonlyMap<string, number>;

export function scheduledWriteDeltas(
  before: ScheduledWriteSnapshot,
  after: ScheduledWriteSnapshot
): ScheduledWriteDelta[] {
  return Array.from(new Set([...before.keys(), ...after.keys()]))
    .map(source => ({
      source,
      unit: (source.startsWith('cron:') ? 'job_runs' : 'rows') as ScheduledWriteDelta['unit'],
      before: before.get(source) ?? 0,
      after: after.get(source) ?? 0,
      writes: Math.max(0, (after.get(source) ?? 0) - (before.get(source) ?? 0)),
    }))
    .filter(delta => delta.writes > 0)
    .sort((left, right) => right.writes - left.writes);
}

export function parseScheduledWriteSnapshot(output: string): Map<string, number> {
  const snapshot = new Map<string, number>();
  for (const line of output.trim().split(/\r?\n/)) {
    if (!line) continue;
    const separator = line.lastIndexOf('|');
    const source = line.slice(0, separator);
    const count = Number(line.slice(separator + 1));
    if (!source || separator < 1 || !Number.isSafeInteger(count) || count < 0) {
      throw new Error('Platform scheduled-write telemetry returned an invalid row.');
    }
    snapshot.set(source, count);
  }
  return snapshot;
}
