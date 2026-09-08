import { describe, expect, it } from 'vitest';
import { buildGlobalsDumpArgs, run } from './export';

describe('export command boundary', () => {
  it('fails closed and redacts connection secrets from a dump failure', () => {
    expect(() =>
      run(
        process.execPath,
        ['-e', "throw new Error('postgresql://postgres:secret@example.test/db')"],
        process.env
      )
    ).toThrow('postgresql://[redacted]@example.test/db');
  });

  it('propagates an upload-style nonzero command failure', () => {
    expect(() => run(process.execPath, ['-e', 'process.exit(17)'], process.env)).toThrow(/failed/);
  });

  it('passes the database URL through pg_dumpall --dbname, never positionally', () => {
    expect(
      buildGlobalsDumpArgs('/tmp/globals.sql', 'postgresql://example.invalid/postgres')
    ).toEqual([
      '--globals-only',
      '--no-role-passwords',
      '--file',
      '/tmp/globals.sql',
      '--dbname',
      'postgresql://example.invalid/postgres',
    ]);
  });
  it('handles listings larger than the subprocess default buffer', () => {
    expect(
      run(
        process.execPath,
        ['-e', 'process.stdout.write("x".repeat(2 * 1024 * 1024))'],
        process.env
      ).length
    ).toBe(2 * 1024 * 1024);
  });
});
