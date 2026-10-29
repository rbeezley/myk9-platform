import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

  function setup() {
    const dir = mkdtempSync(join(tmpdir(), 'tripwire-'));
    dirs.push(dir);
    const approvalsPath = join(dir, 'standing-approvals.md');
    const command = (_name: string, args: string[]): string => {
      const sql = args[args.length - 1] ?? '';
      if (sql.includes('platform_settings')) return 'f\n';
      if (sql.includes('public.clubs')) return `${CLUB_A}\n${CLUB_B}\n`;
      throw new Error(`unexpected query ${sql}`);
    };
    return { dir, approvalsPath, command };
  }

  it('re-reads the approvals file on every run', () => {
    const { approvalsPath, command } = setup();
    writeFileSync(approvalsPath, block('ACTIVE'));
    const env = { MYK9_MIGRATION_DATABASE_URL: 'postgresql://stub' };
    expect(runTripwire({ approvalsPath, command, env, migrationPaths: [] }).code).toBe(0);
    writeFileSync(approvalsPath, block('OFF'));
    expect(runTripwire({ approvalsPath, command, env, migrationPaths: [] }).code).toBe(1);
  });

  it('cannot decide without a database URL', () => {
    const { approvalsPath, command } = setup();
    writeFileSync(approvalsPath, block('ACTIVE'));
    expect(runTripwire({ approvalsPath, command, env: {}, migrationPaths: [] })).toEqual({
      code: 2,
      reason: expect.stringContaining('MYK9_MIGRATION_DATABASE_URL'),
    });
  });

  it('reads the named migration files', () => {
    const { dir, approvalsPath, command } = setup();
    writeFileSync(approvalsPath, block('ACTIVE'));
    const migration = join(dir, '20261030000000_drop.sql');
    writeFileSync(migration, 'drop table public.x;');
    const env = { MYK9_MIGRATION_DATABASE_URL: 'postgresql://stub' };
    expect(runTripwire({ approvalsPath, command, env, migrationPaths: [migration] })).toEqual({
      code: 1,
      reason: expect.stringContaining('20261030000000_drop.sql'),
    });
  });

  it('treats a failing query as could-not-decide', () => {
    const { approvalsPath } = setup();
    writeFileSync(approvalsPath, block('ACTIVE'));
    const failing = () => {
      throw new Error('psql: connection refused');
    };
    const env = { MYK9_MIGRATION_DATABASE_URL: 'postgresql://stub' };
    expect(runTripwire({ approvalsPath, command: failing, env, migrationPaths: [] }).code).toBe(2);
  });
});
