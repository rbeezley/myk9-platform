import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20261117053900_myk9_2115_email_log_contents.sql'
  ),
  'utf8'
);

describe('MYK9-2115 email_log_contents migration', () => {
  it('keeps the table service-role only: RLS on, no policies, anon and authenticated revoked', () => {
    expect(sql).toContain('REFERENCES public.email_log(id) ON DELETE CASCADE');
    expect(sql).toContain('ALTER TABLE public.email_log_contents ENABLE ROW LEVEL SECURITY');
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).toContain(
      'REVOKE ALL ON public.email_log_contents FROM PUBLIC, anon, authenticated'
    );
    expect(sql).toContain('GRANT ALL ON public.email_log_contents TO service_role');
    expect(sql).not.toMatch(/GRANT[^;]*email_log_contents TO (anon|authenticated)/i);
  });

  it('reads only through an RPC that applies the delivery-history permission check', () => {
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain("SET search_path = ''");
    expect(sql).toContain('public.can_manage_show_lifecycle_email(v_show_id)');
    expect(sql).toContain("USING ERRCODE = '42501'");
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION public.get_show_email_content(uuid) FROM PUBLIC, anon'
    );
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION public.get_show_email_content(uuid) TO authenticated'
    );
  });
});
