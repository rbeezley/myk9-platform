import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const migration020 = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/020_fix_rls_performance_warnings.sql'),
  'utf8'
);

describe('isolated E2E migration chain', () => {
  it('defines is_show_secretary before the first policy that references it', () => {
    const helperDefinition = migration020.indexOf('CREATE OR REPLACE FUNCTION is_show_secretary()');
    const firstPolicyReference = migration020.indexOf('OR is_show_secretary()');

    expect(helperDefinition).toBeGreaterThanOrEqual(0);
    expect(firstPolicyReference).toBeGreaterThan(helperDefinition);
  });
});
