import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { SCHEMA_VERSION, type GitFn, type RunRecord } from './types';

export const realGit: GitFn = args =>
  execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** Reads the `daily-commit-review` row of docs/qa/audit-boundary.md. */
export function readBoundaryFromSha(markdown: string): string {
  const row = markdown.split('\n').find(l => /^\|\s*`daily-commit-review`/.test(l));
  const m = row?.match(/`([0-9a-f]{40})`/);
  if (!m) throw new Error('daily-commit-review row has no 40-char SHA (is it unset?)');
  return m[1] as string;
}

export function createRecord(
  fromSha: string,
  toSha: string,
  git: GitFn,
  now = new Date()
): RunRecord {
  const out = fromSha === toSha ? '' : git(['rev-list', '--reverse', `${fromSha}..${toSha}`]);
  const inventory = out
    ? out
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean)
    : [];
  return {
    schemaVersion: SCHEMA_VERSION,
    runId: `${now.toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`,
    createdAt: now.toISOString(),
    boundary: { fromSha, toSha },
    inventory,
    commits: inventory.map(sha => ({ sha, status: 'unreviewed' as const })),
    findings: [],
    verificationLimitations: [],
    publication: { state: 'pending' },
  };
}

/** Git bound to one repository, so `--repo` governs every controller git call. */
export const makeGit =
  (repoDir: string): GitFn =>
  args =>
    execFileSync('git', ['-C', repoDir, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
