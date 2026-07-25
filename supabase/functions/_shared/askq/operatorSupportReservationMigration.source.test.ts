import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    '../../supabase/migrations/20260724180000_reserve_operator_support_query.sql'
  ),
  'utf8'
);

describe('Operator Support quota reservation migration', () => {
  it('serializes each admin quota and creates the redacted audit row atomically', () => {
    expect(migration).toContain('public.reserve_operator_support_query()');
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain("hashtextextended('operator-support:' || v_user_id::text, 0)");
    expect(migration).toContain("query,\n    tools_used,\n    user_id,\n    app_source");
    expect(migration).toContain("'[operator support query redacted]'");
    expect(migration).toContain("app_source = 'operator-support'");
    expect(migration).toContain("response_time_ms,\n    created_at");
    expect(migration).toContain("'operator-support',\n    0,\n    v_now");
  });

  it('derives identity from auth context and limits execution to authenticated callers', () => {
    expect(migration).toContain('v_user_id := auth.uid()');
    expect(migration).toContain('IF NOT public.is_site_admin()');
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.reserve_operator_support_query() FROM PUBLIC, anon'
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.reserve_operator_support_query() TO authenticated'
    );
  });
});
