import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createRecord, readBoundaryFromSha, runCli } from './cli';
import { readRecordRaw, writeRecordAtomic } from './store';
import { validateRecord } from './validate';
import type { GitFn, RunRecord } from './types';

const sha = (n: number) => String(n).padStart(40, 'a');
const FROM = sha(100);
const TO = sha(200);

function fakeGit(inventory: string[]): GitFn {
  return args => {
    if (args[0] === 'rev-parse') return (args[2] ?? '').replace('^{commit}', '');
    if (args[0] === 'rev-list') return inventory.join('\n');
    throw new Error(`unexpected git ${args.join(' ')}`);
  };
}

function record(n: number, from = FROM, to = TO): RunRecord {
  return createRecord(from, to, fakeGit(Array.from({ length: n }, (_, i) => sha(i + 1))));
}

function review(r: RunRecord, count: number) {
  r.commits.slice(0, count).forEach(c => {
    c.status = 'reviewed';
    c.evidence = { reviewedAt: '2026-11-12T00:00:00Z', notes: 'read the diff' };
  });
}

const inv = (n: number) => Array.from({ length: n }, (_, i) => sha(i + 1));

describe('validateRecord', () => {
  it('reports 0/N as incomplete with the whole window remaining', () => {
    const out = validateRecord(record(3), fakeGit(inv(3)));
    expect(out).toMatchObject({
      outcome: 'incomplete',
      targetSha: TO,
      total: 3,
      reviewed: 0,
      unreviewed: 3,
      contiguousReviewedPrefix: { count: 0, lastSha: null },
    });
    expect(out.remainingShas).toEqual(inv(3));
  });

  it('reports partial progress and the contiguous prefix', () => {
    const r = record(4);
    review(r, 2);
    r.commits[3]!.status = 'reviewed';
    r.commits[3]!.evidence = { reviewedAt: '2026-11-12T00:00:00Z', notes: 'x' };
    const out = validateRecord(r, fakeGit(inv(4)));
    expect(out.outcome).toBe('incomplete');
    expect(out).toMatchObject({ reviewed: 3, unreviewed: 1 });
    expect(out.contiguousReviewedPrefix).toEqual({ count: 2, lastSha: sha(2) });
    expect(out.remainingShas).toEqual([sha(3)]);
  });

  it('is complete only with everything reviewed and publication readback-ok', () => {
    const r = record(2);
    review(r, 2);
    expect(validateRecord(r, fakeGit(inv(2))).outcome).toBe('incomplete');
    r.publication = { state: 'readback-ok', commitSha: sha(9) };
    r.findings.push({ id: 'f1', actionable: true, linear: { state: 'filed', issueId: 'MYK9-1' } });
    const out = validateRecord(r, fakeGit(inv(2)));
    expect(out.outcome).toBe('complete');
    expect(out.issueRefs).toEqual(['MYK9-1']);
    expect(out.publication?.state).toBe('readback-ok');
  });

  it('treats an empty window as complete-empty, distinct from 0/N', () => {
    const r = record(0, TO, TO);
    r.publication = { state: 'readback-ok' };
    const out = validateRecord(r, fakeGit([]));
    expect(out).toMatchObject({ outcome: 'complete-empty', total: 0, reviewed: 0, unreviewed: 0 });
  });

  it('blocks an empty record when git says the window is not empty', () => {
    const r = record(0);
    const out = validateRecord(r, fakeGit(inv(2)));
    expect(out.outcome).toBe('blocked');
    expect(out.reasons).toContain(`missing SHA in inventory: ${sha(1)}`);
  });

  it('blocks missing and out-of-range inventory evidence', () => {
    const r = record(3);
    r.inventory = [sha(1), sha(3)];
    r.commits = r.commits.filter(c => c.sha !== sha(2));
    r.inventory.push(sha(77));
    const out = validateRecord(r, fakeGit(inv(3)));
    expect(out.outcome).toBe('blocked');
    expect(out.reasons).toEqual(
      expect.arrayContaining([
        `missing SHA in inventory: ${sha(2)}`,
        `out-of-range SHA in inventory: ${sha(77)}`,
      ])
    );
  });

  it('blocks a duplicate SHA', () => {
    const r = record(2);
    r.inventory = [sha(1), sha(1), sha(2)];
    const out = validateRecord(r, fakeGit(inv(2)));
    expect(out.outcome).toBe('blocked');
    expect(out.reasons).toContain(`duplicate SHA in inventory: ${sha(1)}`);
  });

  it('blocks reordered inventory', () => {
    const r = record(2);
    r.inventory = [sha(2), sha(1)];
    r.commits.reverse();
    const out = validateRecord(r, fakeGit(inv(2)));
    expect(out.outcome).toBe('blocked');
    expect(out.reasons).toContain('inventory order differs from git rev-list --reverse');
  });

  it('never counts a reviewed status without evidence', () => {
    const r = record(2);
    r.commits[0]!.status = 'reviewed';
    const out = validateRecord(r, fakeGit(inv(2)));
    expect(out.outcome).toBe('blocked');
    expect(out.reasons).toContain(`commit ${sha(1)} is marked reviewed without evidence`);
    expect(out.reviewed).toBe(0);
  });

  it('reports an unfilable actionable finding as a filing blocker, never clean', () => {
    const r = record(1);
    review(r, 1);
    r.publication = { state: 'readback-ok' };
    r.findings.push({
      id: 'f1',
      actionable: true,
      linear: { state: 'unfiled', error: 'Linear API 500' },
    });
    const out = validateRecord(r, fakeGit(inv(1)));
    expect(out.outcome).toBe('blocked');
    expect(out.filingBlockers).toEqual(['f1']);
  });

  it('blocks on failed publication and surfaces verification limitations without blocking', () => {
    const r = record(1);
    review(r, 1);
    r.verificationLimitations.push('typecheck not run');
    r.publication = { state: 'failed', error: 'push rejected' };
    expect(validateRecord(r, fakeGit(inv(1))).outcome).toBe('blocked');
    r.publication = { state: 'readback-ok' };
    const out = validateRecord(r, fakeGit(inv(1)));
    expect(out.outcome).toBe('complete');
    expect(out.verificationLimitations).toEqual(['typecheck not run']);
  });

  it('fails closed on malformed records and git failures', () => {
    expect(validateRecord({ schemaVersion: 2 }, fakeGit([])).outcome).toBe('blocked');
    const boom: GitFn = () => {
      throw new Error('bad object');
    };
    expect(validateRecord(record(1), boom).outcome).toBe('blocked');
  });
});

describe('store and cli', () => {
  let dir: string;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  it('round-trips atomically and mark-reviewed persists evidence', () => {
    dir = mkdtempSync(join(tmpdir(), 'commit-review-'));
    const path = join(dir, 'runs', 'r.json');
    writeRecordAtomic(path, record(2));
    const lines: string[] = [];
    const git = fakeGit(inv(2));
    expect(
      runCli(['mark-reviewed', '--record', path, '--sha', sha(1), '--evidence', 'ok'], git, s =>
        lines.push(s)
      )
    ).toBe(0);
    const saved = readRecordRaw(path) as RunRecord;
    expect(saved.commits[0]).toMatchObject({ status: 'reviewed', evidence: { notes: 'ok' } });
    expect(runCli(['validate', '--record', path], git, s => lines.push(s))).toBe(1);
    expect(JSON.parse(lines[1] ?? '{}').outcome).toBe('incomplete');
    expect(
      runCli(
        ['mark-reviewed', '--record', path, '--sha', sha(50), '--evidence', 'x'],
        git,
        () => {}
      )
    ).toBe(1);
  });

  it('add-finding replaces an unfiled finding once a retry files it', () => {
    dir = mkdtempSync(join(tmpdir(), 'commit-review-'));
    const path = join(dir, 'runs', 'r.json');
    writeRecordAtomic(path, record(1));
    const git = fakeGit(inv(1));
    const add = (extra: string[]) =>
      runCli(['add-finding', '--record', path, '--id', 'F1', ...extra], git, () => {});
    expect(add(['--linear-state', 'unfiled', '--error', 'Linear 503'])).toBe(0);
    const lines: string[] = [];
    runCli(['validate', '--record', path], git, s => lines.push(s));
    expect(JSON.parse(lines[0] ?? '{}').filingBlockers).toEqual(['F1']);
    expect(add(['--linear-state', 'filed', '--issue', 'MYK9-1'])).toBe(0);
    const saved = readRecordRaw(path) as RunRecord;
    expect(saved.findings).toEqual([
      expect.objectContaining({ id: 'F1', linear: expect.objectContaining({ state: 'filed' }) }),
    ]);
    runCli(['validate', '--record', path], git, s => lines.push(s));
    expect(JSON.parse(lines[1] ?? '{}').filingBlockers).toEqual([]);
  });

  it('init freezes the boundary from the audit-boundary row and origin/main', () => {
    dir = mkdtempSync(join(tmpdir(), 'commit-review-'));
    const md = join(dir, 'audit-boundary.md');
    writeFileSync(
      md,
      `| \`daily-commit-review\` | \`${FROM}\` | 2026-11-11T00:05:32Z | x | 2026-11-11 |\n`
    );
    expect(readBoundaryFromSha(readFileSync(md, 'utf8'))).toBe(FROM);
    const lines: string[] = [];
    const git: GitFn = args => (args[0] === 'rev-parse' ? TO : inv(2).join('\n'));
    expect(runCli(['init', '--dir', dir, '--boundary-file', md], git, s => lines.push(s))).toBe(0);
    const { path } = JSON.parse(lines[0] ?? '{}');
    expect(readRecordRaw(path)).toMatchObject({
      boundary: { fromSha: FROM, toSha: TO },
      inventory: inv(2),
    });
    expect(() => readBoundaryFromSha('| `daily-commit-review` | `unset` |')).toThrow();
  });
});
