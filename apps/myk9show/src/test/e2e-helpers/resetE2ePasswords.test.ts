import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_ROLES, parseEnvFile, resolveAccounts } from './resetE2ePasswords';

describe('parseEnvFile', () => {
  it('parses KEY=value lines and ignores comments and blanks', () => {
    const parsed = parseEnvFile(
      ['# comment', '', 'E2E_ADMIN_EMAIL=admin@test.myk9.com', 'E2E_ADMIN_PASSWORD=hunter22'].join(
        '\n'
      )
    );
    expect(parsed).toEqual({
      E2E_ADMIN_EMAIL: 'admin@test.myk9.com',
      E2E_ADMIN_PASSWORD: 'hunter22',
    });
  });

  it('strips surrounding quotes and preserves = inside values', () => {
    const parsed = parseEnvFile('A="quoted value"\nB=\'single\'\nC=base64==\n');
    expect(parsed).toEqual({ A: 'quoted value', B: 'single', C: 'base64==' });
  });

  it('ignores malformed lines without a key', () => {
    expect(parseEnvFile('=nokey\nnotakeyvalue\n')).toEqual({});
  });
});

describe('resolveAccounts', () => {
  const baseEnv = {
    E2E_ADMIN_PASSWORD: 'admin-pw',
    E2E_SECRETARY_PASSWORD: 'secretary-pw',
    E2E_JUDGE_PASSWORD: 'judge-pw',
    E2E_DEMO_EXHIBITOR_PASSWORD: 'exhibitor-pw',
  };

  it('resolves canonical default emails when email vars are unset', () => {
    const [secretary] = resolveAccounts(baseEnv, ['secretary']);
    expect(secretary).toEqual({
      role: 'secretary',
      email: 'e2e-secretary@test.myk9.com',
      password: 'secretary-pw',
      passwordVar: 'E2E_SECRETARY_PASSWORD',
    });
  });

  it('prefers explicit email vars and lowercases them', () => {
    const [admin] = resolveAccounts({ ...baseEnv, E2E_ADMIN_EMAIL: 'E2E-Admin@Test.myk9.com' }, [
      'admin',
    ]);
    expect(admin.email).toBe('e2e-admin@test.myk9.com');
  });

  it('throws naming the missing env var when a password is absent', () => {
    expect(() => resolveAccounts({}, ['judge'])).toThrow(/E2E_JUDGE_PASSWORD/);
  });

  it('rejects unknown roles listing the valid ones', () => {
    expect(() => resolveAccounts(baseEnv, ['steward'])).toThrow(/Valid roles: admin, secretary/);
  });

  it('dedupes repeated roles and resolves every canonical role', () => {
    const accounts = resolveAccounts(baseEnv, [...ALL_ROLES, 'admin']);
    expect(accounts.map(account => account.role)).toEqual(ALL_ROLES);
  });
});

describe('setup-e2e-test-users failure signaling', () => {
  it('sets a failing process exit code when any account setup fails', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'scripts/setup-e2e-test-users.ts'),
      'utf8'
    );
    const failedBranchStart = source.indexOf('if (failed.length > 0)');
    const failedBranchEnd = source.indexOf(
      "console.log('\\n========================================');",
      failedBranchStart
    );

    expect(failedBranchStart).toBeGreaterThan(-1);
    expect(failedBranchEnd).toBeGreaterThan(failedBranchStart);
    expect(source.slice(failedBranchStart, failedBranchEnd)).toContain('process.exitCode = 1;');
  });
});
