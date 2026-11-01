// Known-answer tests for the cloud-session stall watcher (MYK9-1602): the pure rule first,
// then the shell loop against a stub `gh` on PATH with a fixed clock.
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  classifyComment,
  decide,
  EXIT,
  matchingPrs,
  type Observation,
} from './watch-cloud-session.ts';

const MIN = 60;
const T0 = 1_800_000_000;
const SHAS = 'abc1234..def5678';
const gate = (verdict: string) => `Review gate: codex reviewed ${SHAS} — ${verdict}\nlog sha256: x`;

function first(over: Partial<Observation>): Observation {
  return {
    mode: 'first',
    dispatchedAt: T0,
    now: T0,
    branchExists: false,
    readyPr: false,
    headCommitAt: null,
    headSha: null,
    gateComments: [],
    ...over,
  };
}
function fix(over: Partial<Observation>): Observation {
  return first({
    mode: 'fix',
    readyPr: true,
    branchExists: true,
    headSha: 'def5678aaaa',
    headCommitAt: T0 - 20 * MIN,
    gateComments: [{ body: findingsComment(), createdAt: T0, authorAssociation: 'OWNER' }],
    ...over,
  });
}

const OWNER = 'OWNER';
const findingsComment = (who = 'Codex', sha = 'def5678') =>
  `${who} findings for ${sha} (not gate evidence):\nCoverage: complete from abc1234\n\n[P1] bug`;

describe('classifyComment', () => {
  it('reads unresolved verdicts as findings and every clean grammar as clean', () => {
    expect(classifyComment(gate('2 findings'), OWNER)?.kind).toBe('findings');
    expect(classifyComment(gate('withdrawn, [P1] race'), OWNER)?.kind).toBe('findings');
    for (const clean of [
      'no findings',
      '3 findings, all addressed',
      '1 finding, all fixed.',
      '2 lenses, all findings addressed',
      'low-risk paths, CI green',
      'override, floor was independent',
    ]) {
      expect(classifyComment(gate(clean), OWNER)?.kind).toBe('clean');
    }
  });
  it('reads the reviewers own findings comments, naming the reviewed head', () => {
    expect(classifyComment(findingsComment('Codex'), 'MEMBER')).toEqual({
      kind: 'findings',
      reviewedHead: 'def5678',
    });
    expect(classifyComment(findingsComment('Claude'), 'COLLABORATOR')?.kind).toBe('findings');
    expect(classifyComment(gate('2 findings'), OWNER)?.reviewedHead).toBe('def5678');
  });
  it('ignores untrusted authors and comments that are not review lines', () => {
    expect(classifyComment(findingsComment(), 'NONE')).toBeNull();
    expect(classifyComment(gate('2 findings'), 'CONTRIBUTOR')).toBeNull();
    expect(classifyComment('Thanks\n' + gate('2 findings'), OWNER)).toBeNull();
    expect(classifyComment('Review gate: looks fine to me', OWNER)).toBeNull();
  });
});

describe('matchingPrs', () => {
  const pr = (headRefName: string, body = '') => ({
    number: 1,
    isDraft: false,
    headRefName,
    body,
  });
  it('matches the prefix or a claude/ branch whose body names the issue', () => {
    expect(matchingPrs([], '5')).toEqual([]);
    expect(matchingPrs([pr('claude/myk9-5-x')], '5')).toHaveLength(1);
    expect(matchingPrs([pr('claude/other', 'Fixes MYK9-5')], '5')).toHaveLength(1);
    expect(matchingPrs([pr('claude/other', 'Fixes MYK9-55')], '5')).toEqual([]);
    expect(matchingPrs([pr('feature/x', 'Fixes MYK9-5')], '5')).toEqual([]);
    expect(matchingPrs([pr('claude/myk9-50-x')], '5')).toEqual([]);
  });
});

describe('decide, first session', () => {
  it('pushed on time with a ready PR is ok', () => {
    expect(decide(first({ now: T0 + 25 * MIN, branchExists: true, readyPr: true }))).toMatchObject({
      kind: 'ok',
    });
  });
  it('waits before 30 min with no branch, stalls NO_PUSH at 30', () => {
    expect(decide(first({ now: T0 + 29 * MIN }))).toEqual({ kind: 'wait' });
    expect(decide(first({ now: T0 + 30 * MIN }))).toMatchObject({
      kind: 'stall',
      code: EXIT.NO_PUSH,
    });
  });
  it('a pushed branch without a ready PR waits past 30 and stalls NO_READY_PR at 60', () => {
    const pushed = { branchExists: true };
    expect(decide(first({ ...pushed, now: T0 + 45 * MIN }))).toEqual({ kind: 'wait' });
    expect(decide(first({ ...pushed, now: T0 + 60 * MIN }))).toMatchObject({
      kind: 'stall',
      code: EXIT.NO_READY_PR,
    });
  });
});

describe('decide, fix session', () => {
  const comment = (body: string, createdAt: number, authorAssociation = 'OWNER') => ({
    body,
    createdAt,
    authorAssociation,
  });
  it('quiet 10 min after a Codex findings comment stalls QUIET_AFTER_FINDINGS', () => {
    expect(decide(fix({ now: T0 + 9 * MIN }))).toEqual({ kind: 'wait' });
    expect(decide(fix({ now: T0 + 10 * MIN }))).toMatchObject({
      kind: 'stall',
      code: EXIT.QUIET_AFTER_FINDINGS,
    });
  });
  it('the Claude findings form and a Review gate withdrawal start the clock too', () => {
    for (const body of [findingsComment('Claude'), gate('1 findings, not addressed')]) {
      const o = fix({ now: T0 + 11 * MIN, gateComments: [comment(body, T0)] });
      expect(decide(o)).toMatchObject({ code: EXIT.QUIET_AFTER_FINDINGS });
    }
  });
  it('an untrusted findings comment never starts the clock', () => {
    const o = fix({
      now: T0 + 60 * MIN,
      dispatchedAt: T0 + 55 * MIN,
      gateComments: [comment(findingsComment(), T0, 'NONE')],
    });
    expect(decide(o)).toEqual({ kind: 'wait' });
  });
  it('a head that no longer starts with the reviewed SHA is delivery, whatever its commit date', () => {
    expect(
      decide(fix({ now: T0 + 40 * MIN, headSha: '9999999bbbb', headCommitAt: T0 - 3600 }))
    ).toMatchObject({ kind: 'ok' });
  });
  it('a head still starting with the reviewed SHA stays quiet even with a newer commit date', () => {
    const o = fix({ now: T0 + 11 * MIN, headCommitAt: T0 + 5 * MIN });
    expect(decide(o)).toMatchObject({ code: EXIT.QUIET_AFTER_FINDINGS });
  });
  it('the clock starts at the findings, not a later dispatch', () => {
    const o = fix({ dispatchedAt: T0 + 30 * MIN, now: T0 + 31 * MIN });
    expect(decide(o)).toMatchObject({ code: EXIT.QUIET_AFTER_FINDINGS });
  });
  it('a later clean gate supersedes the findings', () => {
    const o = fix({
      now: T0 + 60 * MIN,
      gateComments: [
        comment(findingsComment(), T0),
        comment(gate('2 findings, all addressed'), T0 + 5 * MIN),
      ],
    });
    expect(decide(o)).toMatchObject({ kind: 'ok' });
  });
  it('findings posted after an earlier clean gate still count', () => {
    const o = fix({
      now: T0 + 60 * MIN,
      gateComments: [comment(gate('no findings'), T0 - 5 * MIN), comment(findingsComment(), T0)],
    });
    expect(decide(o)).toMatchObject({ code: EXIT.QUIET_AFTER_FINDINGS });
  });
  it('with no findings comment the dispatch time starts the clock; never a usage exit', () => {
    const o = fix({ gateComments: [], now: T0 + 9 * MIN });
    expect(decide(o)).toEqual({ kind: 'wait' });
    expect(decide({ ...o, now: T0 + 10 * MIN })).toMatchObject({ code: EXIT.QUIET_AFTER_FINDINGS });
    expect(decide({ ...o, headCommitAt: T0 + 60 })).toMatchObject({ kind: 'ok' });
  });
  it('an unposted round passed as reviewedSha is not delivered by an older comment', () => {
    // The posted findings name def5678, but the orchestrator reviewed 7777777 without posting.
    const o = fix({ headSha: '7777777cccc', reviewedSha: '7777777', dispatchedAt: T0 + 5 * MIN });
    expect(decide({ ...o, now: T0 + 14 * MIN })).toEqual({ kind: 'wait' });
    expect(decide({ ...o, now: T0 + 15 * MIN })).toMatchObject({
      code: EXIT.QUIET_AFTER_FINDINGS,
    });
    expect(decide({ ...o, headSha: '8888888dddd', now: T0 + 15 * MIN })).toMatchObject({
      kind: 'ok',
    });
  });
  it('an older clean gate does not clear a newer unposted round', () => {
    const o = fix({
      headSha: '7777777cccc',
      reviewedSha: '7777777',
      gateComments: [{ body: gate('no findings'), createdAt: T0, authorAssociation: OWNER }],
      now: T0 + 10 * MIN,
    });
    expect(decide(o)).toMatchObject({ code: EXIT.QUIET_AFTER_FINDINGS });
  });
});

const SCRIPT = join(process.cwd(), 'scripts/cloud/watch-cloud-session.sh');

type World = { prs?: unknown[]; refs?: unknown[]; view?: unknown; ghFails?: boolean };

function runScript(world: World, args: string[], nowOffsetMin: number, cwd = process.cwd()) {
  const dir = mkdtempSync(join(tmpdir(), 'watch-cloud-'));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  writeFileSync(join(dir, 'prs.json'), JSON.stringify(world.prs ?? []));
  writeFileSync(join(dir, 'refs.json'), JSON.stringify(world.refs ?? []));
  writeFileSync(
    join(dir, 'view.json'),
    JSON.stringify(world.view ?? { comments: [], commits: [] })
  );
  writeFileSync(
    join(bin, 'gh'),
    [
      '#!/usr/bin/env bash',
      '[ -n "$GH_FAILS" ] && { echo "gh: network down" >&2; exit 1; }',
      'case "$1" in',
      '  pr) if [ "$2" = list ]; then cat "$WORLD/prs.json"; else cat "$WORLD/view.json"; fi ;;',
      '  api) cat "$WORLD/refs.json" ;;',
      'esac',
      '',
    ].join('\n')
  );
  chmodSync(join(bin, 'gh'), 0o755);
  return spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    cwd,
    env: {
      ...process.env,
      PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`,
      WORLD: dir,
      WATCH_NOW_S: String(T0 + nowOffsetMin * MIN),
      WATCH_POLL_S: '1',
      ...(world.ghFails ? { GH_FAILS: '1' } : {}),
    },
    timeout: 60_000,
  });
}

describe('watch-cloud-session.sh', () => {
  const pr = {
    number: 7,
    isDraft: false,
    headRefName: 'claude/myk9-9-thing-abc',
    headRefOid: 'def5678aaaa',
    body: '',
  };
  const iso = (s: number) => new Date(s * 1000).toISOString();
  const findingsView = (commitAt: number) => ({
    comments: [{ body: findingsComment(), createdAt: iso(T0), authorAssociation: 'OWNER' }],
    commits: [{ committedDate: iso(commitAt) }],
  });
  it('exits 0 for a ready PR seen on time', () => {
    const r = runScript({ prs: [pr], refs: [{}] }, ['9', 'first', String(T0)], 25);
    expect(r.status).toBe(EXIT.OK);
  });
  it('exits 10 when nothing was pushed within 30 min', () => {
    const r = runScript({}, ['9', 'first', String(T0)], 31);
    expect(r.status).toBe(EXIT.NO_PUSH);
    expect(r.stdout).toContain('WATCH_STALL=');
  });
  it('exits 11 when a branch exists but no ready PR within 60 min', () => {
    const r = runScript({ refs: [{}] }, ['9', 'first', iso(T0)], 61);
    expect(r.status).toBe(EXIT.NO_READY_PR);
  });
  it('exits 12 when the head is unchanged 10 min after a findings comment', () => {
    const world = { prs: [pr], refs: [{}], view: findingsView(T0 - 3600) };
    expect(runScript(world, ['9', 'fix', String(T0)], 11).status).toBe(EXIT.QUIET_AFTER_FINDINGS);
  });
  it('exits 0 when the PR head moved off the reviewed SHA', () => {
    const moved = { ...pr, headRefOid: '9999999bbbb' };
    const world = { prs: [moved], refs: [{}], view: findingsView(T0 - 3600) };
    expect(runScript(world, ['9', 'fix', String(T0)], 30).status).toBe(EXIT.OK);
  });
  it('works from a subdirectory', () => {
    const r = runScript({}, ['9', 'first', String(T0)], 31, join(process.cwd(), 'scripts'));
    expect(r.status).toBe(EXIT.NO_PUSH);
  });
  it('exits 3, never a stall code, when gh fails', () => {
    const r = runScript({ ghFails: true }, ['9', 'first', String(T0)], 90);
    expect(r.status).toBe(EXIT.GH_UNREACHABLE);
    expect(r.stderr).toContain('not a stall verdict');
  });
  it('exits 2 on bad arguments', () => {
    expect(runScript({}, ['x', 'first', String(T0)], 1).status).toBe(EXIT.USAGE);
    expect(runScript({}, ['9', 'later', String(T0)], 1).status).toBe(EXIT.USAGE);
    expect(runScript({}, ['9', 'first', String(T0), 'abc1234'], 1).status).toBe(EXIT.USAGE);
    expect(runScript({}, ['9', 'fix', String(T0), 'not-a-sha'], 1).status).toBe(EXIT.USAGE);
  });
  it('a checker crash is exit 3, never a stall or a loop', () => {
    const world = { prs: [pr], refs: [{}], view: { comments: null, commits: null } };
    const r = runScript(world, ['9', 'fix', String(T0)], 30);
    expect(r.status).toBe(EXIT.GH_UNREACHABLE);
    expect(r.stderr).toContain('not a stall verdict');
  });
  it('fix mode with a reviewed SHA argument stalls on an unposted round', () => {
    const head = { ...pr, headRefOid: '7777777cccc' };
    const world = { prs: [head], refs: [{}], view: findingsView(T0 - 3600) };
    expect(runScript(world, ['9', 'fix', String(T0), '7777777'], 11).status).toBe(
      EXIT.QUIET_AFTER_FINDINGS
    );
  });
});
