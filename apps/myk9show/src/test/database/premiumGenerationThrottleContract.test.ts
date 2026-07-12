import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260712120000_premium_generation_throttle.sql'
);

function migrationSql(): string {
  return existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';
}

describe('premium generation throttle migration', () => {
  it('creates a dedicated FORCE-RLS attempt table with enforcement and retention indexes', () => {
    const sql = migrationSql();

    expect(existsSync(migrationPath)).toBe(true);
    expect(sql).toMatch(/CREATE TABLE public\.premium_generation_attempts/i);
    expect(sql).toMatch(/auth_user_id uuid NOT NULL REFERENCES auth\.users\(id\)/i);
    expect(sql).toMatch(/show_id uuid NOT NULL REFERENCES public\.shows\(id\)/i);
    expect(sql).toMatch(/attempted_at timestamptz NOT NULL DEFAULT now\(\)/i);
    expect(sql).toMatch(
      /CREATE INDEX premium_generation_attempts_enforcement_idx\s+ON public\.premium_generation_attempts \(auth_user_id, show_id, attempted_at DESC\)/i
    );
    expect(sql).toMatch(
      /CREATE INDEX premium_generation_attempts_retention_idx\s+ON public\.premium_generation_attempts \(attempted_at\)/i
    );
    expect(sql).toMatch(
      /CREATE INDEX premium_generation_attempts_show_idx\s+ON public\.premium_generation_attempts \(show_id\)/i
    );
    expect(sql).toContain(
      'ALTER TABLE public.premium_generation_attempts ENABLE ROW LEVEL SECURITY;'
    );
    expect(sql).toContain(
      'ALTER TABLE public.premium_generation_attempts FORCE ROW LEVEL SECURITY;'
    );
  });

  it('atomically locks, checks, and records at most five attempts per user and show', () => {
    const sql = migrationSql();

    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.check_and_record_premium_generation_attempt\(\s*p_auth_user_id uuid,\s*p_show_id uuid\s*\)/i
    );
    expect(sql).toContain("interval '15 minutes'");
    expect(sql).toContain('v_max_attempts constant integer := 5;');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain("p_auth_user_id::text || ':' || p_show_id::text");
    expect(sql).toMatch(
      /WHERE auth_user_id = p_auth_user_id\s+AND show_id = p_show_id\s+AND attempted_at >= v_window_start/i
    );

    const lock = sql.indexOf('pg_advisory_xact_lock');
    const count = sql.indexOf('SELECT count(*)');
    const insert = sql.indexOf('INSERT INTO public.premium_generation_attempts');
    expect(lock).toBeGreaterThan(-1);
    expect(count).toBeGreaterThan(lock);
    expect(insert).toBeGreaterThan(count);
  });

  it('prunes only rows older than 24 hours on a service-only daily schedule', () => {
    const sql = migrationSql();

    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.prune_premium_generation_attempts\(\)/i
    );
    expect(sql).toMatch(
      /DELETE FROM public\.premium_generation_attempts\s+WHERE attempted_at < now\(\) - interval '24 hours'/i
    );
    expect(sql).toContain("cron.unschedule('prune-premium-generation-attempts')");
    expect(sql).toMatch(
      /cron\.schedule\(\s*'prune-premium-generation-attempts',\s*'[^']+',\s*\$\$ SELECT public\.prune_premium_generation_attempts\(\); \$\$/i
    );
  });

  it('excludes all client roles from the table and both RPCs', () => {
    const sql = migrationSql();

    expect(sql).toContain(
      'REVOKE ALL ON public.premium_generation_attempts FROM PUBLIC, anon, authenticated;'
    );
    expect(sql).toContain(
      'GRANT SELECT, INSERT, DELETE ON public.premium_generation_attempts TO service_role;'
    );

    for (const signature of [
      'public.check_and_record_premium_generation_attempt(uuid, uuid)',
      'public.prune_premium_generation_attempts()',
    ]) {
      expect(sql).toContain(
        `REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC, anon, authenticated;`
      );
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role;`);
    }
  });

  it('documents exact forward rollback SQL', () => {
    const sql = migrationSql();

    expect(sql).toContain("-- SELECT cron.unschedule('prune-premium-generation-attempts');");
    expect(sql).toContain('-- DROP FUNCTION public.prune_premium_generation_attempts();');
    expect(sql).toContain(
      '-- DROP FUNCTION public.check_and_record_premium_generation_attempt(uuid, uuid);'
    );
    expect(sql).toContain('-- DROP TABLE public.premium_generation_attempts;');
  });
});
