import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  type Approvals,
  evaluateTripwire,
  parseApprovals,
  runCommand,
  runTripwire,
  type TripwireFacts,
} from './prelaunch-tripwire.ts';

const CLUB_A = '11111111-1111-4111-8111-111111111111';
const CLUB_B = '22222222-2222-4222-8222-222222222222';
const STRANGER = '33333333-3333-4333-8333-333333333333';

const approvals: Approvals = { active: true, testClubIds: [CLUB_A, CLUB_B] };
const clean: TripwireFacts = { livemode: false, clubIds: [CLUB_A, CLUB_B] };

function block(status: string, ids: string[] = [CLUB_A, CLUB_B]): string {
  const fence = '```';
  return [
    '# Standing approvals',
    '',
    `${fence}standing-approvals`,
    `status: ${status}`,
    'test-clubs:',
    ...ids.map(id => `  - ${id}`),
    fence,
    '',
  ].join('\n');
}

describe('evaluateTripwire', () => {
  it.each<[string, Approvals | null, TripwireFacts, 0 | 1 | 2, string]>([
    ['no approvals block', null, clean, 2, 'approvals block'],
    ['approvals OFF', { ...approvals, active: false }, clean, 1, 'OFF'],
    ['livemode unreadable', approvals, { ...clean, livemode: null }, 2, 'stripe_livemode'],
    ['livemode on', approvals, { ...clean, livemode: true }, 1, 'live'],
    ['clubs unreadable', approvals, { ...clean, clubIds: null }, 2, 'clubs'],
    ['an unknown club', approvals, { ...clean, clubIds: [CLUB_A, STRANGER] }, 1, STRANGER],
  ])('%s', (_label, a, facts, code, reason) => {
    expect(evaluateTripwire(a, facts)).toEqual({ code, reason: expect.stringContaining(reason) });
  });

  it('passes when every club is a test club and nothing is live', () => {
    expect(evaluateTripwire(approvals, clean).code).toBe(0);
  });

  it('reports the first failing check: approvals before livemode before clubs', () => {
    const worst: TripwireFacts = { livemode: true, clubIds: [STRANGER] };
    expect(evaluateTripwire({ ...approvals, active: false }, worst).reason).toContain('OFF');
    expect(evaluateTripwire(approvals, worst).reason).toContain('live');
  });
});

describe('parseApprovals', () => {
  it('reads the status and the test clubs', () => {
    expect(parseApprovals(block('ACTIVE'))).toEqual({
      active: true,
      testClubIds: [CLUB_A, CLUB_B],
    });
    expect(parseApprovals(block('OFF'))?.active).toBe(false);
  });

  it.each([
    ['no block', '# nothing here\n'],
    ['two blocks', block('ACTIVE') + block('ACTIVE')],
    ['no status line', block('ACTIVE').replace('status: ACTIVE\n', '')],
    ['lower-case status', block('active')],
    ['no test-clubs line', block('ACTIVE').replace('test-clubs:\n', '')],
    ['a test-club entry that is not a uuid', block('ACTIVE', ['not-a-uuid'])],
    ['a second status line', block('ACTIVE').replace('test-clubs:', 'status: OFF\ntest-clubs:')],
    [
      'a second test-clubs list',
      block('ACTIVE').replace(`- ${CLUB_B}`, `- ${CLUB_B}\ntest-clubs:`),
    ],
    ['an unknown field', block('ACTIVE').replace('test-clubs:', 'paused: true\ntest-clubs:')],
    [
      'a line after the club list',
      block('ACTIVE').replace(`- ${CLUB_B}`, `- ${CLUB_B}\nstatus: OFF`),
    ],
  ])('returns null for %s', (_label, markdown) => {
    expect(parseApprovals(markdown)).toBeNull();
  });
});

describe('runTripwire (the CLI core)', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  const POOLER =
    'postgresql://postgres.sojmvhhwsjxmfistvzbe@aws-1-us-east-2.pooler.supabase.com:5432/postgres';
  const env = { PGPASSWORD: 'secret' };

  /** A checkout with its own approvals file, main's copy, and stub git/psql. */
  function setup(main: { status?: string; fails?: boolean } = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'tripwire-'));
    dirs.push(dir);
    const approvalsPath = join(dir, 'standing-approvals.md');
    const calls: string[][] = [];
    const psqlEnvs: NodeJS.ProcessEnv[] = [];
    const command = (name: string, args: string[], cmdEnv?: NodeJS.ProcessEnv): string => {
      calls.push([name, ...args]);
      if (name === 'psql') psqlEnvs.push(cmdEnv ?? {});
      if (name === 'git' && args[0] === 'fetch') return '';
      if (name === 'git' && args[0] === 'show') {
        if (main.fails) throw new Error('fatal: invalid object name');
        return block(main.status ?? 'ACTIVE');
      }
      const sql = args[args.length - 1] ?? '';
      if (sql.includes('platform_settings')) return 'f\n';
      if (sql.includes('public.clubs')) return `${CLUB_A}\n${CLUB_B}\n`;
      throw new Error(`unexpected command ${name} ${args.join(' ')}`);
    };
    const run = (argv: string[] = []) => runTripwire({ approvalsPath, argv, env, command });
    return { approvalsPath, command, calls, psqlEnvs, run };
  }

  it('re-reads the approvals file on every run', () => {
    const { approvalsPath, run } = setup();
    writeFileSync(approvalsPath, block('ACTIVE'));
    expect(run().code).toBe(0);
    writeFileSync(approvalsPath, block('OFF'));
    expect(run().code).toBe(1);
  });

  it("stops when main's copy says OFF even though the checkout says ACTIVE", () => {
    const { approvalsPath, run, calls } = setup({ status: 'OFF' });
    writeFileSync(approvalsPath, block('ACTIVE'));
    expect(run()).toEqual({ code: 1, reason: expect.stringContaining('OFF') });
    expect(calls.some(c => c[0] === 'git' && c[1] === 'fetch')).toBe(true);
  });

  it("cannot decide when main's copy cannot be read", () => {
    const { approvalsPath, run } = setup({ fails: true });
    writeFileSync(approvalsPath, block('ACTIVE'));
    expect(run().code).toBe(2);
  });

  it('cannot decide without PGPASSWORD', () => {
    const { approvalsPath, command } = setup();
    writeFileSync(approvalsPath, block('ACTIVE'));
    expect(runTripwire({ approvalsPath, argv: [], env: {}, command })).toEqual({
      code: 2,
      reason: expect.stringContaining('PGPASSWORD'),
    });
  });

  it('always queries the myK9 pooler, whatever the environment says', () => {
    const { approvalsPath, command, calls, psqlEnvs } = setup();
    writeFileSync(approvalsPath, block('ACTIVE'));
    const hostile = {
      PGPASSWORD: 'secret',
      PATH: '/usr/bin',
      MYK9_MIGRATION_DATABASE_URL: 'postgresql://postgres@127.0.0.1:54322/postgres',
      PGHOST: '127.0.0.1',
      PGSERVICE: 'local',
      PGDATABASE: 'other',
    };
    expect(runTripwire({ approvalsPath, argv: [], env: hostile, command }).code).toBe(0);
    const psqlCalls = calls.filter(c => c[0] === 'psql');
    expect(psqlCalls.length).toBeGreaterThan(0);
    for (const c of psqlCalls) expect(c[1]).toBe(POOLER);
    for (const e of psqlEnvs) {
      expect(Object.keys(e).filter(k => k.startsWith('PG'))).toEqual(['PGPASSWORD']);
      expect(e).toMatchObject({ PGPASSWORD: 'secret', PATH: '/usr/bin' });
    }
  });

  it.each([[['--db-push']], [['--functions-deploy']], [['--anything']]])(
    'rejects an unknown argument: %j',
    argv => {
      const { approvalsPath, run } = setup();
      writeFileSync(approvalsPath, block('ACTIVE'));
      expect(run(argv).code).toBe(2);
    }
  );

  it('treats a failing query as could-not-decide', () => {
    const { approvalsPath } = setup();
    writeFileSync(approvalsPath, block('ACTIVE'));
    const failing = (name: string, args: string[]) => {
      if (name === 'git') return args[0] === 'show' ? block('ACTIVE') : '';
      throw new Error('psql: connection refused');
    };
    const options = { approvalsPath, argv: [], env, command: failing };
    expect(runTripwire(options).code).toBe(2);
  });
});

describe('runCommand', () => {
  it('gives up on a stalled command instead of hanging', () => {
    const started = Date.now();
    expect(() => runCommand('sleep', ['5'], process.env, 200)).toThrow();
    expect(Date.now() - started).toBeLessThan(3000);
  });
});
