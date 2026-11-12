/**
 * pnpm qa:commit-review:validate --record <path>
 * Subcommands: init | validate (default) | mark-reviewed | add-finding | set-publication
 * Exits 0 only for complete / complete-empty. Never dispatches or resumes workers.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { DEFAULT_RUNS_DIR, readRecordRaw, recordPath, writeRecordAtomic } from './store';
import { validateRecord } from './validate';
import {
  SCHEMA_VERSION,
  type GitFn,
  type LinearState,
  type PublicationState,
  type RunRecord,
} from './types';

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

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function need(args: string[], name: string): string {
  const v = flag(args, name);
  if (!v) throw new Error(`missing --${name}`);
  return v;
}

export function runCli(
  argv: string[],
  git: GitFn = realGit,
  out: (s: string) => void = console.log
): number {
  const known = ['init', 'validate', 'mark-reviewed', 'add-finding', 'set-publication'];
  const first = argv[0] ?? '';
  const cmd = known.includes(first) ? first : 'validate';
  const args = known.includes(first) ? argv.slice(1) : argv;
  try {
    if (cmd === 'init') {
      const dir = flag(args, 'dir') ?? DEFAULT_RUNS_DIR;
      const boundaryFile = flag(args, 'boundary-file') ?? 'docs/qa/audit-boundary.md';
      const fromSha = readBoundaryFromSha(readFileSync(boundaryFile, 'utf8'));
      const toSha = git(['rev-parse', '--verify', 'origin/main^{commit}']);
      const record = createRecord(fromSha, toSha, git);
      const path = recordPath(dir, record.runId);
      if (existsSync(path)) throw new Error(`record already exists: ${path}`);
      writeRecordAtomic(path, record);
      out(
        JSON.stringify({
          path,
          runId: record.runId,
          ...record.boundary,
          total: record.inventory.length,
        })
      );
      return 0;
    }
    const path = need(args, 'record');
    if (cmd === 'validate') {
      const outcome = validateRecord(readRecordRaw(path), git);
      out(JSON.stringify(outcome, null, 2));
      return outcome.outcome === 'complete' || outcome.outcome === 'complete-empty' ? 0 : 1;
    }
    const record = readRecordRaw(path) as RunRecord;
    if (cmd === 'mark-reviewed') {
      const sha = need(args, 'sha');
      const entry = record.commits.find(c => c.sha === sha);
      if (!entry) throw new Error(`${sha} is not in the record inventory`);
      const notes = need(args, 'evidence').trim();
      if (!notes) throw new Error('--evidence must not be empty');
      entry.status = 'reviewed';
      entry.evidence = { reviewedAt: new Date().toISOString(), notes };
    } else if (cmd === 'add-finding') {
      const state = (flag(args, 'linear-state') ?? 'unfiled') as LinearState;
      record.findings.push({
        id: need(args, 'id'),
        actionable: flag(args, 'actionable') !== 'false',
        linear: { state, issueId: flag(args, 'issue'), error: flag(args, 'error') },
      });
    } else {
      record.publication = {
        state: need(args, 'state') as PublicationState,
        commitSha: flag(args, 'commit'),
        error: flag(args, 'error'),
      };
    }
    writeRecordAtomic(path, record);
    out(JSON.stringify({ ok: true, command: cmd }));
    return 0;
  } catch (err) {
    out(JSON.stringify({ outcome: 'blocked', reasons: [(err as Error).message] }));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runCli(process.argv.slice(2));
}
