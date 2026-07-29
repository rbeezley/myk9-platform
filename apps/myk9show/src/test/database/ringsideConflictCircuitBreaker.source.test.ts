import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260729100000_ringside_conflict_circuit_breaker.sql'
  ),
  'utf8'
);

describe('ringside conflict circuit breaker migration', () => {
  it('records a singleton durable breaker with a conservative per-minute threshold', () => {
    expect(migration).toContain('CREATE TABLE public.ringside_conflict_breaker');
    expect(migration).toMatch(/conflict_threshold\s+integer\s+NOT NULL DEFAULT 300/i);
    expect(migration).toContain("state IN ('armed', 'tripped')");
    expect(migration).toContain('observed_conflicts');
    expect(migration).toContain('tripped_at');
    expect(migration).toContain(
      'ALTER TABLE public.ringside_conflict_breaker FORCE ROW LEVEL SECURITY'
    );
    expect(migration).toMatch(
      /CREATE POLICY ringside_conflict_breaker_deny_all[\s\S]+USING \(false\)[\s\S]+WITH CHECK \(false\)/i
    );
  });

  it('trips by revoking the ringside RPC and never auto-grants it', () => {
    expect(migration).toContain(
      'REVOKE EXECUTE ON FUNCTION public.ringside_update_entry(uuid, jsonb, integer) FROM authenticated'
    );
    expect(migration).not.toContain(
      'GRANT EXECUTE ON FUNCTION public.ringside_update_entry(uuid, jsonb, integer) TO authenticated'
    );
    expect(migration).toContain("state = 'tripped'");
  });

  it('schedules a one-minute monitor and keeps control functions away from clients', () => {
    expect(migration).toContain("'ringside-conflict-circuit-breaker'");
    expect(migration).toContain("'* * * * *'");
    expect(migration).toContain('public.monitor_ringside_conflict_breaker()');
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.monitor_ringside_conflict_breaker\(\)\s+FROM PUBLIC, anon, authenticated/i
    );
  });
});
