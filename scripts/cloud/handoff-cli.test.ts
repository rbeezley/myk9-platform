import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { appendHandoff, ghFailure, GhError, readHandoff, type Gh } from './handoff-cli.ts';
import { formatEventComment, type HandoffEvent } from './handoff.ts';
import { chain, event, HEAD } from './handoff-fixtures.ts';

type Comment = { body: string; author_association: string };
type RawArtifact = {
  name: string;
  expired: boolean;
  digest?: string | null;
  workflow_run?: { id: number; head_sha: string };
};

/** A fake gh over one PR; records every write so the tests can assert there were none. */
function fakeGh(options: {
  comments?: Comment[];
  pull?: { state: string; merged_at: string | null; head: { sha: string } };
  artifacts?: Record<string, RawArtifact[]>;
  runs?: Record<string, string>;
  /** Run ids whose every endpoint fails as gh would, keyed to that failure. */
  failingRuns?: Record<string, GhError>;
}) {
  const writes: { args: string[]; input?: string }[] = [];
  const gh: Gh = (args, input) => {
    if (args.includes('POST')) {
      writes.push({ args, input });
      return '{}';
    }
    const path = args.find(arg => arg.startsWith('repos/')) ?? '';
    const failing = /actions\/runs\/(\d+)/.exec(path)?.[1];
    if (failing && options.failingRuns?.[failing]) throw options.failingRuns[failing];
    if (path.endsWith('/comments')) return JSON.stringify([options.comments ?? []]);
    if (/\/pulls\/\d+$/.test(path)) {
      return JSON.stringify(
        options.pull ?? { state: 'open', merged_at: null, head: { sha: HEAD } }
      );
    }
    const artifacts = /actions\/runs\/(\d+)\/artifacts$/.exec(path);
    if (artifacts) return JSON.stringify({ artifacts: options.artifacts?.[artifacts[1]!] ?? [] });
    const run = /actions\/runs\/(\d+)$/.exec(path);
    if (run) return JSON.stringify({ status: options.runs?.[run[1]!] ?? 'completed' });
    throw new Error(`unexpected gh call: ${args.join(' ')}`);
  };
  return { gh, writes };
}

const trusted = (event: HandoffEvent): Comment => ({
  body: formatEventComment(event),
  author_association: 'OWNER',
});

describe('readHandoff', () => {
  it('rebuilds the next action from PR comments alone', () => {
    const events = chain({}, { phase: 'implemented', nextAction: 'mark ready for review' });
    const { gh, writes } = fakeGh({
      comments: [
        ...events.map(trusted),
        { body: formatEventComment(event({ phase: 'needs-human' })), author_association: 'NONE' },
      ],
    });
    expect(readHandoff(gh, 3300)).toMatchObject({
      decision: 'continue',
      nextAction: 'mark ready for review',
      rejected: 1,
    });
    expect(writes).toEqual([]);
  });

  it('reads artifact expiry and the owning Actions run from the API', () => {
    const pointer = {
      kind: 'artifact' as const,
      runId: '77',
      attempt: 1,
      name: 'review',
      digest: 'sha256:1',
    };
    const events = chain({}, { phase: 'reviewed', result: 'clean', evidence: [pointer] });
    const { gh } = fakeGh({
      comments: events.map(trusted),
      artifacts: { '77': [{ name: 'review', expired: true }] },
    });
    expect(readHandoff(gh, 3300)).toMatchObject({ cleanEvidence: false });

    const running = chain({
      phase: 'reviewing',
      ownerUrl: 'https://github.com/o/r/actions/runs/88',
    });
    const live = fakeGh({ comments: running.map(trusted), runs: { '88': 'in_progress' } });
    expect(readHandoff(live.gh, 3300).decision).toBe('wait');
  });

  // R2-04: remote evidence disappearing is the case the recovery command exists for.
  describe('a referenced Actions run that no longer exists', () => {
    const NOT_FOUND = new GhError('gh api failed (exit 1)', 404);
    const pointer = {
      kind: 'artifact' as const,
      runId: '77',
      attempt: 1,
      name: 'review',
      digest: 'sha256:1',
    };

    it('reads a deleted evidence run as unavailable and asks for a replacement', () => {
      const events = chain({}, { phase: 'reviewed', result: 'clean', evidence: [pointer] });
      const { gh } = fakeGh({ comments: events.map(trusted), failingRuns: { '77': NOT_FOUND } });
      expect(readHandoff(gh, 3300)).toMatchObject({
        decision: 'continue',
        cleanEvidence: false,
        nextAction: expect.stringMatching(/replacement review attempt/),
      });
    });

    it('reads a deleted owner run as gone and hands the decision to its owner', () => {
      const events = chain({
        phase: 'reviewing',
        ownerUrl: 'https://github.com/o/r/actions/runs/88',
      });
      const { gh } = fakeGh({ comments: events.map(trusted), failingRuns: { '88': NOT_FOUND } });
      expect(readHandoff(gh, 3300)).toMatchObject({
        decision: 'needs-human',
        cleanEvidence: false,
        nextAction: expect.stringMatching(/owner/),
      });
    });

    it.each([
      ['an auth failure on the evidence run', '77', new GhError('gh api failed', 401)],
      ['a network failure on the evidence run', '77', new GhError('gh api failed', null)],
      ['an auth failure on the owner run', '88', new GhError('gh api failed', 403)],
      ['a network failure on the owner run', '88', new GhError('gh api failed', null)],
    ])('still fails loudly on %s, never reading it as clean', (_label, runId, error) => {
      const events = chain({
        phase: 'reviewed',
        result: 'clean',
        evidence: [pointer],
        ownerUrl: 'https://github.com/o/r/actions/runs/88',
      });
      const { gh } = fakeGh({
        comments: events.map(trusted),
        artifacts: { '77': [] },
        failingRuns: { [runId]: error },
      });
      expect(() => readHandoff(gh, 3300)).toThrow(error);
    });

    it.each([
      ['gh: Not Found (HTTP 404)\n', 404],
      ['gh: Bad credentials (HTTP 401)\n', 401],
      ['error connecting to api.github.com\n', null],
    ])('reads the HTTP status gh reports in %j', (stderr, status) => {
      expect(ghFailure(['api', 'x'], 1, stderr).httpStatus).toBe(status);
    });
  });

  describe('artifact identity', () => {
    const pointer = {
      kind: 'artifact' as const,
      runId: '77',
      attempt: 1,
      name: 'review',
      digest: 'sha256:expected',
    };
    const events = chain({}, { phase: 'reviewed', result: 'clean', evidence: [pointer] });
    const exact: RawArtifact = {
      name: 'review',
      expired: false,
      digest: 'sha256:expected',
      workflow_run: { id: 77, head_sha: HEAD },
    };

    it('counts the exact artifact as clean evidence', () => {
      const { gh } = fakeGh({ comments: events.map(trusted), artifacts: { '77': [exact] } });
      expect(readHandoff(gh, 3300)).toMatchObject({ cleanEvidence: true });
    });

    it.each([
      ['a different digest under the same name', { digest: 'sha256:replacement' }],
      ['no digest (unverifiable)', { digest: null }],
      ['another run', { workflow_run: { id: 78, head_sha: HEAD } }],
      ['another commit', { workflow_run: { id: 77, head_sha: 'f'.repeat(40) } }],
    ])('treats %s as unavailable', (_label, change) => {
      const { gh } = fakeGh({
        comments: events.map(trusted),
        artifacts: { '77': [{ ...exact, ...change }] },
      });
      expect(readHandoff(gh, 3300)).toMatchObject({
        cleanEvidence: false,
        nextAction: expect.stringMatching(/replacement review attempt/),
      });
    });
  });

  it('needs a human when a trusted ledger record is invalid, hiding the older clean event', () => {
    const events = chain({}, { phase: 'reviewed', result: 'clean' });
    const forged = { ...event({ parentEventId: events[1]!.eventId, phase: 'needs-human' }) };
    forged.eventId = 'evt_not_the_content_hash';
    const { gh } = fakeGh({ comments: [...events.map(trusted), trusted(forged)] });
    expect(readHandoff(gh, 3300)).toMatchObject({
      decision: 'needs-human',
      cleanEvidence: false,
      invalid: 1,
    });
  });

  it('treats an event recorded for another PR as an invalid record of this one', () => {
    const { gh } = fakeGh({ comments: chain({ pr: 9999 }).map(trusted) });
    expect(readHandoff(gh, 3300)).toMatchObject({ decision: 'needs-human', invalid: 1 });
  });
});

describe('appendHandoff', () => {
  const ENV = { GH_TOKEN: 'ghp_synthetic_token_0001' };

  it('refuses to append to a ledger holding an invalid trusted record', async () => {
    const events = chain({});
    const forged = { ...event({ parentEventId: events[0]!.eventId }), eventId: 'evt_forged' };
    const { gh, writes } = fakeGh({ comments: [...events.map(trusted), trusted(forged)] });
    const next = event({ parentEventId: events[0]!.eventId, phase: 'implemented' });
    const result = await appendHandoff(gh, 3300, next, ENV);
    expect(result).toMatchObject({
      posted: false,
      message: expect.stringMatching(/^invalid ledger/),
    });
    expect(writes).toEqual([]);
  });

  it('posts a child of the latest event with the Claude footer', async () => {
    const events = chain({});
    const { gh, writes } = fakeGh({ comments: events.map(trusted) });
    const next = event({ parentEventId: events[0]!.eventId, phase: 'implemented' });
    await expect(appendHandoff(gh, 3300, next, ENV)).resolves.toMatchObject({ posted: true });
    expect(writes).toHaveLength(1);
    const body = (JSON.parse(writes[0]!.input ?? '{}') as { body: string }).body;
    expect(body).toContain(next.eventId);
    expect(body.endsWith('_Generated by [Claude Code](https://claude.ai/code)_')).toBe(true);
  });

  it('writes nothing for a stale, duplicate, tampered or secret-bearing event', async () => {
    const events = chain({}, { phase: 'implemented' });
    const cases: [HandoffEvent, RegExp][] = [
      [event({ parentEventId: events[0]!.eventId, phase: 'reviewing' }), /^stale/],
      [events[1]!, /^duplicate/],
      [event({ parentEventId: events[1]!.eventId, pr: 9999 }), /^wrong PR/],
      [event({ parentEventId: events[1]!.eventId, pr: null }), /^wrong PR/],
      [{ ...event({ parentEventId: events[1]!.eventId }), result: 'clean' }, /^invalid event/],
      [
        event({ parentEventId: events[1]!.eventId, nextAction: `use ${ENV.GH_TOKEN}` }),
        /^blocked: secret found/,
      ],
    ];
    for (const [next, reason] of cases) {
      const { gh, writes } = fakeGh({ comments: events.map(trusted) });
      const result = await appendHandoff(gh, 3300, next, ENV);
      expect(result.posted).toBe(false);
      expect(result.message).toMatch(reason);
      expect(result.message).not.toContain(ENV.GH_TOKEN);
      expect(writes).toEqual([]);
    }
  });
});

describe('handoff-cli as a script', () => {
  it('loads under the repository module format and rejects a missing --pr', () => {
    const cli = fileURLToPath(new URL('./handoff-cli.ts', import.meta.url));
    const result = spawnSync(process.execPath, ['--import', 'tsx', cli, 'read'], {
      encoding: 'utf8',
    });
    expect(result.stderr).toContain('--pr=<number> is required');
    expect(result.status).toBe(2);
  });
});
