import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { SCHEMA_VERSION, type RunRecord } from './types';

/** Default only; every function takes the directory/path as a parameter. */
export const DEFAULT_RUNS_DIR = join(
  homedir(),
  '.codex',
  'automations',
  'nightly-commit-review',
  'runs'
);

export function recordPath(runsDir: string, runId: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(runId)) throw new Error(`unsafe runId: ${runId}`);
  return join(runsDir, `${runId}.json`);
}

/** Atomic: write a sibling temp file, then rename over the target. */
export function writeRecordAtomic(path: string, record: RunRecord): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  renameSync(tmp, path);
}

/** Reads and parses; shape problems are reported by the validator, not here. */
export function readRecordRaw(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function isRecordShape(value: unknown): value is RunRecord {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  const b = r.boundary as Record<string, unknown> | undefined;
  return (
    r.schemaVersion === SCHEMA_VERSION &&
    typeof r.runId === 'string' &&
    typeof b?.fromSha === 'string' &&
    typeof b?.toSha === 'string' &&
    Array.isArray(r.inventory) &&
    Array.isArray(r.commits) &&
    Array.isArray(r.findings) &&
    Array.isArray(r.verificationLimitations) &&
    !!r.publication &&
    typeof (r.publication as Record<string, unknown>).state === 'string'
  );
}
