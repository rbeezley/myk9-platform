/**
 * Integration test: cron ↔ Vault secret guard.
 *
 * Uses the real Supabase DB — requires SUPABASE_SERVICE_ROLE_KEY in .env.
 * Run with: pnpm test:integration
 *
 * Two properties, deliberately separated so a green run can't hide a dead parser:
 *   1. list_cron_vault_secret_refs() actually extracts references (parser has
 *      teeth) — a silently-broken regex would return zero rows and fail here.
 *   2. audit_cron_vault_secrets() (the missing-only view) is empty — every
 *      referenced Vault secret exists. This is the operational invariant that
 *      broke `waitlist-offer-expiration` on 2026-07-04.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Missing env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
}

// Service-role client — both functions are granted to service_role only.
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface RefRow {
  jobname: string;
  secret_name: string;
  secret_exists: boolean;
}

interface MissingRow {
  jobname: string;
  missing_secret: string;
}

describe('cron ↔ Vault secret guard', () => {
  it('the parser extracts Vault-secret references (has teeth)', async () => {
    const { data, error } = await admin.rpc('list_cron_vault_secret_refs');

    expect(error).toBeNull();
    const refs = (data ?? []) as RefRow[];

    // A silently-broken regex returns zero rows — this pins that the parser
    // still finds references. (This project always has Vault-backed crons:
    // payouts, heritage confirmations, waitlist expiration.)
    expect(
      refs.length,
      'list_cron_vault_secret_refs() found no references — the parser may be broken'
    ).toBeGreaterThan(0);
  });

  it('every scheduled cron references a Vault secret that exists', async () => {
    // Cross-check via the raw parser output...
    const { data: refsData, error: refsErr } = await admin.rpc('list_cron_vault_secret_refs');
    expect(refsErr).toBeNull();
    const missingFromRefs = ((refsData ?? []) as RefRow[]).filter(r => !r.secret_exists);

    // ...and via the missing-only view; the two must agree.
    const { data: auditData, error: auditErr } = await admin.rpc('audit_cron_vault_secrets');
    expect(auditErr).toBeNull();
    const missing = (auditData ?? []) as MissingRow[];

    const detail = missing
      .map(r => `${r.jobname} → missing Vault secret '${r.missing_secret}'`)
      .join('; ');

    expect(missing, detail || undefined).toEqual([]);
    expect(missingFromRefs).toEqual([]);
  });
});
