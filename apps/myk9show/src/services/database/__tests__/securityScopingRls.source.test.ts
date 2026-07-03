import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

describe('security scoping RLS migrations', () => {
  const promoMigration = read(
    '../../../../../../supabase/migrations/20260703130000_scope_promo_codes_rls.sql'
  );
  const suppliesMigration = read(
    '../../../../../../supabase/migrations/20260703131000_scope_trial_judge_supplies_rls.sql'
  );

  it('scopes promo code catalog and writes to the row show or trial', () => {
    expect(promoMigration).toContain('FUNCTION public.can_manage_promo_code_scope');
    expect(promoMigration).toContain('public.can_manage_show(check_show_id)');
    expect(promoMigration).toContain('public.can_manage_trial(check_trial_id)');
    expect(promoMigration).toContain('created_by = auth.uid()');
    expect(promoMigration).not.toContain('USING (auth.uid() IS NOT NULL)');
  });

  it('adds typed-code promo validation without granting catalog select', () => {
    expect(promoMigration).toContain('FUNCTION public.validate_promo_code_for_entry');
    expect(promoMigration).toContain('SECURITY DEFINER');
    expect(promoMigration).toContain("SET search_path = ''");
    expect(promoMigration).toContain('upper(pc.code) = upper(p_code)');
    expect(promoMigration).toContain('GRANT EXECUTE ON FUNCTION public.validate_promo_code_for_entry');
  });

  it('scopes trial judge supply reads and writes to trial managers', () => {
    expect(suppliesMigration).toContain('DROP POLICY IF EXISTS "trial_judge_supplies_select"');
    expect(suppliesMigration).toContain('public.can_manage_trial(trial_id)');
    expect(suppliesMigration).not.toContain('auth.uid() IS NOT NULL');
  });
});

describe('promo-code validation client path', () => {
  const readsSource = read('../promo-codes/reads.ts');

  it('uses the validate-only RPC for exhibitor typed-code lookup', () => {
    expect(readsSource).toContain("supabase.rpc(\n      'validate_promo_code_for_entry' as never");
    expect(readsSource).not.toContain(".or(`trial_id.eq.${trialId},show_id.eq.${showId}`)");
  });
});
