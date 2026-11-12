/**
 * pnpm qa:commit-review:validate --record <path>
 * Subcommands: init | validate (default) | mark-reviewed | add-finding | set-publication
 *   | publish-check [--apply] | run (the controller, see controller.ts)
 * The record subcommands never dispatch workers; only `run` does.
 */
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { DEFAULT_RUNS_DIR, readRecordRaw, recordPath, writeRecordAtomic } from './store';
import { validateRecord } from './validate';
import { createRecord, readBoundaryFromSha, realGit } from './record';
import { publishCheck } from './publish';
import { runControllerMain } from './controller';
import { type GitFn, type LinearState, type PublicationState, type RunRecord } from './types';

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function need(args: string[], name: string): string {
  const v = flag(args, name);
  if (!v) throw new Error(`missing --${name}`);
  return v;
}

export { createRecord, readBoundaryFromSha, realGit };

export function runCli(
  argv: string[],
  git: GitFn = realGit,
  out: (s: string) => void = console.log
): number {
  const known = [
    'init',
    'validate',
    'mark-reviewed',
    'add-finding',
    'set-publication',
    'publish-check',
  ];
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
    if (cmd === 'publish-check') {
      const check = publishCheck(record, git);
      if (!check.ok) {
        out(JSON.stringify(check));
        return 1;
      }
      if (args.includes('--apply') && record.publication.state !== 'readback-ok') {
        record.publication = { ...record.publication, state: 'readback-ok', error: undefined };
        writeRecordAtomic(path, record);
        out(JSON.stringify({ ...check, applied: true }));
      } else {
        out(
          JSON.stringify({
            ...check,
            note:
              record.publication.state === 'readback-ok'
                ? 'already read back; nothing written'
                : 'readback ok; pass --apply to record it',
          })
        );
      }
      return 0;
    }
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
      const finding = {
        id: need(args, 'id'),
        actionable: flag(args, 'actionable') !== 'false',
        linear: { state, issueId: flag(args, 'issue'), error: flag(args, 'error') },
      };
      // Upsert by id: a filing retry that succeeds replaces the earlier `unfiled` entry.
      const existing = record.findings.findIndex(f => f.id === finding.id);
      if (existing >= 0) record.findings[existing] = finding;
      else record.findings.push(finding);
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
  const argv = process.argv.slice(2);
  if (argv[0] === 'run') {
    runControllerMain(argv.slice(1)).then(code => {
      process.exitCode = code;
    });
  } else {
    process.exitCode = runCli(argv);
  }
}
