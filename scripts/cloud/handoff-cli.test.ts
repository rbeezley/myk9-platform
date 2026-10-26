import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { appendHandoff, ghFailure, GhError, readHandoff, runCli, type Gh } from './handoff-cli.ts';
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
  /** Run ids deleted mid-read: every request from this page on 404s. */
  goneFromPage?: Record<string, number>;
}) {
  const writes: { args: string[]; input?: string }[] = [];
  const gh: Gh = (args, input) => {
    if (args.includes('POST')) {
      writes.push({ args, input });
      return '{}';
    }
    // The cloud proxy 403s `--paginate`: its next links use `repositories/{id}/…`
    // paths (MYK9-1425). Every list must be paged by hand.
    if (args.includes('--paginate')) {
      throw new GhError('Numeric-ID repository paths are not supported (HTTP 403)', 403);
    }
    const url = args.find(arg => arg.startsWith('repos/')) ?? '';
    const path = url.split('?')[0]!;
    // GitHub's own paging: 30 rows unless `per_page` says otherwise.
    const size = Number(/[?&]per_page=(\d+)/.exec(url)?.[1] ?? 30);
    const page = Number(/[?&]page=(\d+)/.exec(url)?.[1] ?? 1);
    const slice = <T>(rows: T[]) => rows.slice((page - 1) * size, page * size);
    const runId = /actions\/runs\/(\d+)/.exec(path)?.[1];
    if (runId && options.failingRuns?.[runId]) throw options.failingRuns[runId];
    const goneFrom = runId ? options.goneFromPage?.[runId] : undefined;
    if (goneFrom !== undefined && page >= goneFrom) throw new GhError('gh api failed', 404);
    if (path.endsWith('/comments')) return JSON.stringify(slice(options.comments ?? []));
    if (/\/pulls\/\d+$/.test(path)) {
      return JSON.stringify(
        options.pull ?? { state: 'open', merged_at: null, head: { sha: HEAD } }
      );
    }
    const artifacts = /actions\/runs\/(\d+)\/artifacts$/.exec(path);
    if (artifacts) {
      const all = options.artifacts?.[artifacts[1]!] ?? [];
      return JSON.stringify({ total_count: all.length, artifacts: slice(all) });
    }
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

  it('reads ledger comments past the first page', () => {
    const events = chain({}, { phase: 'implemented', nextAction: 'mark ready for review' });
    const chatter = Array.from({ length: 150 }, (_, index) => ({
      body: `comment ${index}`,
      author_association: 'NONE',
    }));
    const { gh } = fakeGh({ comments: [...chatter, ...events.map(trusted)] });
    expect(readHandoff(gh, 3300)).toMatchObject({
      decision: 'continue',
      nextAction: 'mark ready for review',
    });
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
    // A run's other artifacts: one and a half pages of them.
    const others = Array.from({ length: 150 }, (_, index) => ({
      ...exact,
      name: `log-${index}`,
      digest: `sha256:other-${index}`,
    }));

    it('counts the exact artifact as clean evidence', () => {
      const { gh } = fakeGh({ comments: events.map(trusted), artifacts: { '77': [exact] } });
      expect(readHandoff(gh, 3300)).toMatchObject({ cleanEvidence: true });
    });

    it('never lets an available replacement vouch for a second pointer with the same name', () => {
      const replaced = chain(
        {},
        {
          phase: 'reviewed',
          result: 'clean',
          // The missing one first: the available one is read last.
          evidence: [{ ...pointer, digest: 'sha256:missing' }, pointer],
        }
      );
      const { gh } = fakeGh({ comments: replaced.map(trusted), artifacts: { '77': [exact] } });
      expect(readHandoff(gh, 3300)).toMatchObject({
        cleanEvidence: false,
        nextAction: expect.stringMatching(/replacement review attempt/),
      });
    });

    it('finds the exact artifact past the first page of the run', () => {
      const { gh } = fakeGh({
        comments: events.map(trusted),
        artifacts: { '77': [...others, exact] },
      });
      expect(readHandoff(gh, 3300)).toMatchObject({ cleanEvidence: true });
    });

    // Codex, review of #3287: a run deleted between page reads 404s on a later
    // page. That must read the whole run as gone, not keep the earlier pages.
    it('reads a run deleted mid-read as gone, not as its first page', () => {
      const { gh } = fakeGh({
        comments: events.map(trusted),
        artifacts: { '77': [exact, ...others] },
        goneFromPage: { '77': 2 },
      });
      expect(readHandoff(gh, 3300)).toMatchObject({
        cleanEvidence: false,
        nextAction: expect.stringMatching(/replacement review attempt/),
      });
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

/**
 * The CLI prints what it reads, and what it reads can hold a configured
 * secret before any scan has run: a malformed event file, a path, a failing
 * call's message. Every line it prints passes one scrubbing boundary.
 */
describe('the handoff CLI never prints a configured secret', () => {
  const SECRET = 'sk-synthetic-boundary-0001';
  // Short enough that Node's parse error quotes it whole.
  const SHORT_SECRET = 'pw8chars1';
  const CLI = fileURLToPath(new URL('./handoff-cli.ts', import.meta.url));

  function spawnCli(args: string[]) {
    return spawnSync(process.execPath, ['--import', 'tsx', CLI, ...args], {
      encoding: 'utf8',
      env: { ...process.env, OPENAI_API_KEY: SECRET, E2E_TEST_PASSWORD: SHORT_SECRET },
    });
  }

  it('fails a malformed event file holding a secret without echoing it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'handoff-boundary-'));
    try {
      const file = join(dir, 'event.json');
      // Unquoted, as a hand-edited file might hold it: Node's parse error then
      // quotes the input back.
      writeFileSync(file, `{"nextAction": ${SHORT_SECRET}}`);
      const result = spawnCli(['append', '--pr=3300', `--event=${file}`]);
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/handoff: failed/);
      expect(`${result.stdout}${result.stderr}`).not.toContain(SHORT_SECRET);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails a missing event file whose path holds a secret without echoing it', () => {
    const result = spawnCli(['append', '--pr=3300', `--event=/nonexistent/${SECRET}.json`]);
    expect(result.status).toBe(2);
    expect(`${result.stdout}${result.stderr}`).not.toContain(SECRET);
  });

  it('scrubs a failing gh call and what a read prints', async () => {
    const lines: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((...a) => void lines.push(a.join(' ')));
    const err = vi
      .spyOn(console, 'error')
      .mockImplementation((...a) => void lines.push(a.join(' ')));
    try {
      const failing: Gh = () => {
        throw new Error(`gh: token ${SECRET} rejected`);
      };
      expect(await runCli(['read', '--pr=3300'], failing, { OPENAI_API_KEY: SECRET })).toBe(2);
      const ledger = chain({}, { phase: 'implemented', nextAction: `paste ${SECRET}` });
      const { gh } = fakeGh({ comments: ledger.map(trusted) });
      expect(await runCli(['read', '--pr=3300'], gh, { OPENAI_API_KEY: SECRET })).toBe(0);
    } finally {
      log.mockRestore();
      err.mockRestore();
    }
    expect(lines.join('\n')).not.toContain(SECRET);
    expect(lines.join('\n')).toMatch(/handoff: failed/);
  });
});
