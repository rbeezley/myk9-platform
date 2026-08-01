import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const functionPath = resolve(
  testDir,
  '../../../../../../supabase/functions/push-trigger-announcement/index.ts'
);
const vaultMigrationPath = resolve(
  testDir,
  '../../../../../../supabase/migrations/20260603074455_notify_announcement_push_webhook_secret.sql'
);
const searchPathMigrationPath = resolve(
  testDir,
  '../../../../../../supabase/migrations/20260603090000_notify_announcement_push_search_path.sql'
);
const sendPushNotificationPath = resolve(
  testDir,
  '../../../../../../supabase/functions/send-push-notification/index.ts'
);
const classStatusTriggerPath = resolve(
  testDir,
  '../../../../../../supabase/functions/push-trigger-class-status/index.ts'
);
const scoringTriggerPath = resolve(
  testDir,
  '../../../../../../supabase/functions/push-trigger-scoring/index.ts'
);
const classAndScoringVaultMigrationPath = resolve(
  testDir,
  '../../../../../../supabase/migrations/20260703122000_push_trigger_webhook_secret.sql'
);

describe('push-trigger-announcement function contract', () => {
  it('authenticates the webhook against the dedicated PUSH_WEBHOOK_SECRET bearer', () => {
    const source = readFileSync(functionPath, 'utf8');

    // The shared helper reads only PUSH_WEBHOOK_SECRET and runs before body parsing.
    expect(source).toContain("from '../_shared/pushWebhookAuth.ts'");
    expect(source).toContain('beforeBody: requirePushWebhookSecret');
    expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    // #1561 moved the `is_active` / `expires_at` predicate out of this file and
    // into applyActiveRoleValidity(). Assert the helper is applied rather than
    // the literal it replaced — roleValidityCoverage.test.ts enforces the same
    // contract across all 13 privileged Edge paths.
    expect(source).toContain("from '../_shared/roleValidity.ts'");
    expect(source).toContain('applyActiveRoleValidity(');
    expect(source.indexOf('beforeBody: requirePushWebhookSecret')).toBeLessThan(
      source.indexOf('webpush.sendNotification')
    );
  });

  it('resolves the audience from owner + co-owner + handler, not owner alone', () => {
    const source = readFileSync(functionPath, 'utf8');

    // Show-wide announcements should reach everyone attached to an entry, matching
    // send-targeted-message — not just the primary owner.
    expect(source).toContain('co_owner:people!co_owner_id(auth_user_id)');
    expect(source).toContain('handler:people!handler_id(auth_user_id)');
    expect(source).toContain('entry.dog?.co_owner?.auth_user_id');
    expect(source).toContain('entry.handler?.auth_user_id');
  });

  it('reads push subscriptions with the current p256dh/auth columns, not the dropped keys column', () => {
    const source = readFileSync(functionPath, 'utf8');

    // push_subscriptions migrated keys -> (p256dh, auth). Selecting the dropped
    // `keys` column made every chunk query error out, so the function reported
    // no_subscriptions_found and never sent. Mirror push-trigger-chat-message.
    expect(source).toContain(".select('user_id, endpoint, p256dh, auth')");
    expect(source).toContain('keys: { p256dh: sub.p256dh, auth: sub.auth }');
    expect(source).not.toContain("endpoint, keys')");
    expect(source).not.toContain('keys: sub.keys');
  });
});

describe('notify_announcement_push config from Vault', () => {
  const sql = readFileSync(vaultMigrationPath, 'utf8');

  it('reads edge config + a dedicated webhook secret from Vault, not GUCs or the service key', () => {
    expect(sql).toContain('vault.decrypted_secrets');
    expect(sql).toContain("where name = 'edge_function_base_url'");
    // Bearer is a dedicated webhook secret, decoupled from the service-role key.
    expect(sql).toContain("where name = 'push_webhook_secret'");
    expect(sql).toContain("'Bearer ' || webhook_secret");
    expect(sql).not.toContain("where name = 'service_role_key'");
    // Config no longer comes from app.settings GUCs (ALTER DATABASE SET is gone).
    expect(sql).not.toContain('current_setting');
  });

  it('guards (NOTICE + RETURN NEW) instead of raising when a secret is missing', () => {
    // An AFTER INSERT trigger must skip, not raise — otherwise the broadcast
    // INSERT aborts again. (Unlike the heritage cron, which may raise.)
    expect(sql).toMatch(/raise notice[\s\S]*return new;/i);
    expect(sql).not.toContain('raise exception');
  });

  it('targets the push-trigger-announcement edge function via the Vault base url', () => {
    expect(sql).toContain("edge_function_base_url || '/push-trigger-announcement'");
  });
});

describe('notify_announcement_push search_path hardening', () => {
  const sql = readFileSync(searchPathMigrationPath, 'utf8');

  it('pins search_path to empty on the SECURITY DEFINER function', () => {
    // The Supabase linter flags SECURITY DEFINER functions with a mutable
    // search_path (function_search_path_mutable). Pinning it to '' forces every
    // reference to be schema-qualified so a caller can't shadow an unqualified
    // name and run it with the function owner's privileges. Matches the sibling
    // notify_chat_message hardening (20260603085719).
    expect(sql).toContain('security definer');
    expect(sql).toContain("set search_path = ''");
  });

  it('is behavior-preserving — same Vault secrets, bearer, guard-skip, and target', () => {
    // The body must stay byte-compatible with the live definition (20260603074455);
    // only the search_path clause is new. Re-assert the behavioral contract so a
    // future edit that drifts the body fails here.
    expect(sql).toContain('create or replace function public.notify_announcement_push()');
    expect(sql).toContain("where name = 'edge_function_base_url'");
    expect(sql).toContain("where name = 'push_webhook_secret'");
    expect(sql).toContain("'Bearer ' || webhook_secret");
    expect(sql).toContain("edge_function_base_url || '/push-trigger-announcement'");
    expect(sql).toMatch(/raise notice[\s\S]*return new;/i);
    expect(sql).not.toContain('raise exception');
    expect(sql).not.toContain("where name = 'service_role_key'");
    expect(sql).not.toContain('current_setting');
  });
});

describe('send-push-notification subscription columns', () => {
  // Invoked by push-trigger-class-status and push-trigger-scoring — same dropped
  // `keys` column bug would silently break class-start / results-posted pushes.
  const source = readFileSync(sendPushNotificationPath, 'utf8');

  it('reads p256dh/auth, not the dropped keys column', () => {
    expect(source).toContain(".select('endpoint, p256dh, auth')");
    expect(source).toContain('keys: { p256dh: sub.p256dh, auth: sub.auth }');
    expect(source).not.toContain("'endpoint, keys'");
    expect(source).not.toContain('keys: sub.keys');
  });
});

describe('class-status and scoring push audience contracts', () => {
  it('does not reference a nonexistent entries.user_id column in the DB trigger', () => {
    const sql = readFileSync(classAndScoringVaultMigrationPath, 'utf8');

    expect(sql).not.toContain('new.user_id');
    expect(sql).not.toContain("'user_id', new.user_id");
    expect(sql).toContain("'handler_id', new.handler_id");
  });

  it('resolves scoring recipients from owner, co-owner, and handler auth links', () => {
    const source = readFileSync(scoringTriggerPath, 'utf8');

    expect(source).toContain('owner:people!owner_id(auth_user_id)');
    expect(source).toContain('co_owner:people!co_owner_id(auth_user_id)');
    expect(source).toContain('handler:people!handler_id(auth_user_id)');
    expect(source).toContain('entry?.dog?.owner?.auth_user_id');
    expect(source).toContain('entry?.dog?.co_owner?.auth_user_id');
    expect(source).toContain('entry?.handler?.auth_user_id');
    expect(source).not.toContain('body.record.user_id');
  });

  it('resolves class-start recipients from owner, co-owner, and handler auth links', () => {
    const source = readFileSync(classStatusTriggerPath, 'utf8');

    expect(source).toContain('owner:people!owner_id(auth_user_id)');
    expect(source).toContain('co_owner:people!co_owner_id(auth_user_id)');
    expect(source).toContain('handler:people!handler_id(auth_user_id)');
    expect(source).toContain('entry.dog?.owner?.auth_user_id');
    expect(source).toContain('entry.dog?.co_owner?.auth_user_id');
    expect(source).toContain('entry.handler?.auth_user_id');
    expect(source).toContain(
      '.not(\'entry_status\', \'in\', \'("withdrawn","scratched","absent")\')'
    );
    expect(source).toContain(".not('check_in_status', 'eq', 'pulled')");
    expect(source).not.toContain(".select('user_id')");
    expect(source).not.toContain(".not('entry_status', 'eq', 'pulled')");
  });
});
