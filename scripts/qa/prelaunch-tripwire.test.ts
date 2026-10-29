import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  type Approvals,
  destructiveStatements,
  evaluateTripwire,
  parseApprovals,
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
    [
      'a destructive migration',
      approvals,
      { ...clean, migrations: [{ path: 'm/1.sql', sql: 'DROP TABLE public.x;' }] },
      1,
      'm/1.sql',
    ],
  ])('%s', (_label, a, facts, code, reason) => {
    expect(evaluateTripwire(a, facts)).toEqual({ code, reason: expect.stringContaining(reason) });
  });

  it('passes when every club is a test club and nothing is live', () => {
    expect(evaluateTripwire(approvals, clean).code).toBe(0);
  });

  it('passes a migration whose only DROP TABLE is in a comment', () => {
    const facts = {
      ...clean,
      migrations: [{ path: 'm/2.sql', sql: '-- DROP TABLE public.x;\nselect 1;' }],
    };
    expect(evaluateTripwire(approvals, facts).code).toBe(0);
  });

  it('reports the first failing check: approvals before livemode before clubs', () => {
    const worst: TripwireFacts = { livemode: true, clubIds: [STRANGER] };
    expect(evaluateTripwire({ ...approvals, active: false }, worst).reason).toContain('OFF');
    expect(evaluateTripwire(approvals, worst).reason).toContain('live');
  });
});

describe('destructiveStatements', () => {
  it.each([
    ['DROP TABLE public.x;', 1],
    ['alter table public.x drop column y;', 1],
    ['truncate public.x;', 1],
    ['DELETE FROM public.x;', 1],
    ['delete from public.x where id = 1;', 0],
    ['/* DROP TABLE public.x; */ select 1;', 0],
    ["do $$ begin execute 'select 1'; drop table public.y; end $$;", 1],
    ['create table public.z (id int);', 0],
    ['ALTER TABLE a DROP b;', 1],
    ['DROP SCHEMA s CASCADE;', 1],
    ['DELETE FROM a WHERE true;', 1],
    ["COMMENT ON TABLE a IS 'x -- y'; DROP TABLE b;", 1],
    ["COMMENT ON TABLE a IS 'x /* y'; DROP TABLE b; -- */", 1],
    ['alter table a drop constraint c;', 0],
    ['alter table a alter column b drop default;', 0],
    ['alter table a alter column b drop not null;', 0],
  ])('%s → %i statement(s)', (sql, count) => {
    expect(destructiveStatements(sql)).toHaveLength(count);
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
    ['a test-club entry that is not a uuid', block('ACTIVE', ['not-a-uuid'])],
  ])('returns null for %s', (_label, markdown) => {
    expect(parseApprovals(markdown)).toBeNull();
  });
});

describe('runTripwire (the CLI core)', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  const env = { MYK9_MIGRATION_DATABASE_URL: 'postgresql://stub' };

  /** A checkout with its own approvals file, main's copy, a migrations dir, and stub git/psql. */
  function setup(main: { status?: string; fails?: boolean } = {}, pushed: string[] = []) {
    const dir = mkdtempSync(join(tmpdir(), 'tripwire-'));
    dirs.push(dir);
    const approvalsPath = join(dir, 'standing-approvals.md');
    const migrationsDir = join(dir, 'migrations');
    mkdirSync(migrationsDir);
    const calls: string[][] = [];
    const command = (name: string, args: string[]): string => {
      calls.push([name, ...args]);
      if (name === 'git' && args[0] === 'fetch') return '';
      if (name === 'git' && args[0] === 'show') {
        if (main.fails) throw new Error('fatal: invalid object name');
        return block(main.status ?? 'ACTIVE');
      }
      const sql = args[args.length - 1] ?? '';
      if (sql.includes('platform_settings')) return 'f\n';
      if (sql.includes('public.clubs')) return `${CLUB_A}\n${CLUB_B}\n`;
      if (sql.includes('schema_migrations')) return pushed.map(v => `${v}\n`).join('');
      throw new Error(`unexpected command ${name} ${args.join(' ')}`);
    };
    const run = (argv: string[] = []) =>
      runTripwire({ approvalsPath, migrationsDir, argv, env, command });
    return { approvalsPath, migrationsDir, command, calls, run };
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

  it('cannot decide without a database URL', () => {
    const { approvalsPath, migrationsDir, command } = setup();
    writeFileSync(approvalsPath, block('ACTIVE'));
    expect(runTripwire({ approvalsPath, migrationsDir, argv: [], env: {}, command })).toEqual({
      code: 2,
      reason: expect.stringContaining('MYK9_MIGRATION_DATABASE_URL'),
    });
  });

  it('--db-push scans every pending migration, not only the ones an agent names', () => {
    const { approvalsPath, migrationsDir, run } = setup({}, ['20261029000000']);
    writeFileSync(approvalsPath, block('ACTIVE'));
    writeFileSync(join(migrationsDir, '20261029000000_pushed.sql'), 'drop table public.old;');
    writeFileSync(
      join(migrationsDir, '20261030000000_mine.sql'),
      'create table public.a (id int);'
    );
    writeFileSync(join(migrationsDir, '20261030010000_other.sql'), 'alter table public.b drop c;');
    expect(run(['--db-push'])).toEqual({
      code: 1,
      reason: expect.stringContaining('20261030010000_other.sql'),
    });
    expect(run().code).toBe(0);
  });

  it.each([[['--migration', 'x.sql']], [['--db-push=1']], [['--migration']]])(
    'rejects an unknown argument: %j',
    argv => {
      const { approvalsPath, run } = setup();
      writeFileSync(approvalsPath, block('ACTIVE'));
      expect(run(argv).code).toBe(2);
    }
  );

  it('treats a failing query as could-not-decide', () => {
    const { approvalsPath, migrationsDir } = setup();
    writeFileSync(approvalsPath, block('ACTIVE'));
    const failing = (name: string, args: string[]) => {
      if (name === 'git') return args[0] === 'show' ? block('ACTIVE') : '';
      throw new Error('psql: connection refused');
    };
    const options = { approvalsPath, migrationsDir, argv: [], env, command: failing };
    expect(runTripwire(options).code).toBe(2);
  });
});
