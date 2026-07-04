/**
 * Integration test: audit_cron_vault_secrets() guard.
 *
 * Uses the real Supabase DB — requires SUPABASE_SERVICE_ROLE_KEY in .env.
 * Run with: pnpm test:integration
 *
 * The guard reports any pg_cron job that references a vault.decrypted_secrets
 * name which does not exist. Invariant: on a correctly provisioned project the
 * result is EMPTY. This test goes red the moment a Vault-backed cron is
 * scheduled without its secret seeded — the exact regression that broke
 * `waitlist-offer-expiration` on 2026-07-04.
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

// Service-role client — audit_cron_vault_secrets() is granted to service_role only.
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface MissingSecretRow {
  jobname: string;
  missing_secret: string;
}

describe('audit_cron_vault_secrets — Vault-backed cron config drift', () => {
  it('every scheduled cron references a Vault secret that exists', async () => {
    const { data, error } = await admin.rpc('audit_cron_vault_secrets');

    expect(error).toBeNull();
    expect(data).not.toBeNull();

    const missing = (data ?? []) as MissingSecretRow[];

    // Surface the offenders in the failure message so the fix is obvious:
    // each row is a (job, secret) that must be seeded via vault.create_secret.
    const detail = missing
      .map(r => `${r.jobname} → missing Vault secret '${r.missing_secret}'`)
      .join('; ');
    expect(missing, detail || undefined).toEqual([]);
  });
});
