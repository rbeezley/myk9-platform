import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDir = resolve(__dirname, '../../migrations');
const throttleMigrations = readdirSync(migrationsDir)
  .filter(file => file.endsWith('.sql'))
  .sort()
  .filter(file =>
    readFileSync(join(migrationsDir, file), 'utf8').includes(
      'CREATE OR REPLACE FUNCTION public.check_and_record_premium_generation_attempt'
    )
  );
const migrationSource = readFileSync(
  join(migrationsDir, throttleMigrations[throttleMigrations.length - 1]!),
  'utf8'
);

describe('premium-generation account quota migration', () => {
  it('locks by account, not by public show', () => {
    expect(migrationSource).toContain("'premium-generation-account:' || p_auth_user_id::text");
    expect(migrationSource).not.toContain(
      "'premium-generation:' || p_auth_user_id::text || ':' || p_show_id::text"
    );
  });

  it('counts both the account and requested-show windows', () => {
    expect(migrationSource).toContain(
      'premium_generation_attempts_account_idx\n  ON public.premium_generation_attempts (auth_user_id, attempted_at DESC)'
    );
    expect(migrationSource).toContain('v_account_attempt_count');
    expect(migrationSource).toContain('v_show_attempt_count');
    expect(migrationSource).toContain('count(*) FILTER (WHERE show_id = p_show_id)');
    expect(migrationSource).toContain('IF v_account_attempt_count >= v_max_attempts THEN');
    expect(migrationSource).toContain('IF v_show_attempt_count >= v_max_attempts THEN');
  });

  it('keeps the RPC restricted to the service role', () => {
    expect(migrationSource).toContain(
      'REVOKE ALL ON FUNCTION public.check_and_record_premium_generation_attempt(uuid, uuid) FROM PUBLIC, anon, authenticated;'
    );
    expect(migrationSource).toContain(
      'GRANT EXECUTE ON FUNCTION public.check_and_record_premium_generation_attempt(uuid, uuid) TO service_role;'
    );
  });
});
