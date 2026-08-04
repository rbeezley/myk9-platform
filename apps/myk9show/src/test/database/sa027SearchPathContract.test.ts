import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../../../../..');
const decision = readFileSync(
  resolve(repoRoot, 'docs/security/sa-027-search-path-accepted-risk.md'),
  'utf8'
);
const migration = readFileSync(
  resolve(repoRoot, 'supabase/migrations/20260804160000_public_schema_create_acl_probe.sql'),
  'utf8'
);

const inventoryIdentities = [
  'assert_active_waitlist_offer_payment_link()',
  'check_class_availability(uuid)',
  'check_login_rate_limit(text)',
  'get_admin_user_list(boolean)',
  'get_my_onboarding_requests()',
  'handle_entry_scoring_state_change()',
  'hard_delete_show(uuid)',
  'promote_waitlist_entry(uuid, integer)',
  'promote_waitlist_entry_from_cron(uuid)',
  'promote_waitlist_entry_internal(uuid, integer)',
  'recalculate_class_placements(uuid[], boolean)',
  'record_entry_status_history()',
  'record_login_attempt(text, boolean, text, uuid, text)',
  'refresh_class_scoring_state(uuid)',
  'resolve_class_result_visibility(uuid)',
  'restrict_payment_status_update()',
  'restrict_subscription_column_updates()',
  'soft_delete_class(uuid)',
  'soft_delete_dog(uuid)',
  'soft_delete_show(uuid)',
  'update_thread_last_message_at()',
] as const;

describe('SA-027 accepted-risk contract', () => {
  it('keeps the complete 21-function inventory explicit', () => {
    expect(inventoryIdentities).toHaveLength(21);
    for (const identity of inventoryIdentities) {
      const escapedIdentity = identity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(decision).toMatch(new RegExp(`\\| \\x60${escapedIdentity}\\x60\\s*\\|`));
    }
  });

  it('records an owner, conversion policy, and applied-evidence gate', () => {
    expect(decision).toContain('**Owner:**');
    expect(decision).toContain("SET search_path = ''");
    expect(decision).toContain('Closure still requires an applied probe result');
  });

  it('locks the ACL probe to an empty path and service_role-only execution', () => {
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain(
      'revoke all on function public.public_schema_create_acl_probe() from public;'
    );
    expect(migration).toContain(
      'grant execute on function public.public_schema_create_acl_probe() to service_role;'
    );
    expect(migration).toContain(
      'revoke create on schema public from anon, authenticated, service_role;'
    );
    expect(migration).toContain("array['anon', 'authenticated', 'service_role']");
    expect(migration).toContain("'CREATE'");
  });
});
