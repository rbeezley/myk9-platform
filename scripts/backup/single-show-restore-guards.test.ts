import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_FLAG,
  PRODUCTION_PROJECT_REF,
  parseRestoreArgs,
  targetConnection,
} from './single-show-restore-guards';

const SHOW = '00000000-0000-0000-0000-00000000000a';
const base = ['--dir', './decrypted', '--show-id', SHOW];

describe('single-show restore guards', () => {
  it('defaults to a dry run with no target', () => {
    const args = parseRestoreArgs(base);
    expect(args.execute).toBe(false);
    expect(args.targetRef).toBeUndefined();
  });

  it('refuses --execute without an explicit target', () => {
    expect(() => parseRestoreArgs([...base, '--execute'])).toThrow(/explicit --target-ref/);
  });

  it('refuses the production ref without the flag, even for a dry run', () => {
    expect(() => parseRestoreArgs([...base, '--target-ref', PRODUCTION_PROJECT_REF])).toThrow(
      /refusing to target production/
    );
    expect(() =>
      parseRestoreArgs([...base, '--execute', '--target-ref', PRODUCTION_PROJECT_REF])
    ).toThrow(/refusing to target production/);
  });

  it('accepts production only with the documented flag', () => {
    const args = parseRestoreArgs([
      ...base,
      '--execute',
      '--target-ref',
      PRODUCTION_PROJECT_REF,
      PRODUCTION_FLAG,
    ]);
    expect(args.allowProduction).toBe(true);
    expect(() =>
      parseRestoreArgs([...base, '--target-ref', 'abcdefghijklmnopqrst', PRODUCTION_FLAG])
    ).toThrow(/only applies/);
  });

  it('rejects bad input', () => {
    expect(() => parseRestoreArgs(['--dir', 'x', '--show-id', 'nope'])).toThrow(/show UUID/);
    expect(() => parseRestoreArgs([...base, '--bogus'])).toThrow(/unknown option/);
    expect(() => parseRestoreArgs([...base, '--dry-run', '--execute'])).toThrow(/mutually/);
    expect(() => parseRestoreArgs(['--show-id', SHOW])).toThrow(/--dir/);
  });

  it('maps the target URL to libpq env and checks it names the ref', () => {
    const args = parseRestoreArgs([...base, '--execute', '--target-ref', 'abcdefghijklmnopqrst']);
    const url =
      'postgresql://postgres.abcdefghijklmnopqrst:p%40ss@aws-0-us.pooler.supabase.com:5432/postgres';
    const conn = targetConnection(url, args);
    expect(conn.env.PGPASSWORD).toBe('p@ss');
    expect(conn.env.PGSSLMODE).toBe('verify-full');
    expect(() => targetConnection(undefined, args)).toThrow(/required/);
    expect(() =>
      targetConnection('postgresql://postgres.zzzzzzzzzzzzzzzzzzzz:x@h.supabase.com/postgres', args)
    ).toThrow(/does not name project/);
    expect(() =>
      targetConnection(
        `postgresql://postgres:x@db.${PRODUCTION_PROJECT_REF}.supabase.co/postgres`,
        args
      )
    ).toThrow(/points at production/);
  });

  it('parses --include-money and defaults it off', () => {
    expect(parseRestoreArgs(base).includeMoney).toBe(false);
    expect(parseRestoreArgs([...base, '--include-money']).includeMoney).toBe(true);
  });

  it('refuses an execute run whose URL names production, even with a staging target-ref', () => {
    const args = parseRestoreArgs([...base, '--execute', '--target-ref', 'abcdefghijklmnopqrst']);
    expect(() =>
      targetConnection(
        `postgresql://postgres.${PRODUCTION_PROJECT_REF}:x@pooler.supabase.com/postgres`,
        args
      )
    ).toThrow(/points at production/);
    expect(() => targetConnection('mysql://x@h/db', args)).toThrow(/postgresql/);
  });

  it('compares refs case-insensitively', () => {
    const upper = PRODUCTION_PROJECT_REF.toUpperCase();
    expect(() => parseRestoreArgs([...base, '--target-ref', upper])).toThrow(
      /refusing to target production/
    );
    const args = parseRestoreArgs([...base, '--execute', '--target-ref', 'ABCDEFGHIJKLMNOPQRST']);
    expect(args.targetRef).toBe('abcdefghijklmnopqrst');
    expect(() =>
      targetConnection(`postgresql://postgres:x@DB.${upper}.supabase.co/postgres`, args)
    ).toThrow(/points at production/);
    const host = 'postgresql://postgres.ABCDEFGHIJKLMNOPQRST:x@pooler.supabase.com/postgres';
    expect(targetConnection(host, args).env.PGUSER).toBe('postgres.ABCDEFGHIJKLMNOPQRST');
  });

  it('validates --target-ref as a 20 character project ref', () => {
    for (const bad of [
      'short',
      'abcdefghijklmnopqrstu',
      'abcdefghij_lmnopqrst',
      'abcdefghijklmnopqrs!',
    ])
      expect(() => parseRestoreArgs([...base, '--target-ref', bad]), bad).toThrow(/20 character/);
    expect(parseRestoreArgs([...base, '--target-ref', 'abcdefghijklmnopqrst']).targetRef).toBe(
      'abcdefghijklmnopqrst'
    );
  });
});
