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
const sendPushNotificationPath = resolve(
  testDir,
  '../../../../../../supabase/functions/send-push-notification/index.ts'
);

describe('push-trigger-announcement function contract', () => {
  it('authenticates the webhook against the dedicated PUSH_WEBHOOK_SECRET bearer', () => {
    const source = readFileSync(functionPath, 'utf8');

    // Decoupled from SUPABASE_SERVICE_ROLE_KEY (which a DB trigger can't match
    // after the JWT signing-key migration) — validates a dedicated shared secret.
    expect(source).toContain("Deno.env.get('PUSH_WEBHOOK_SECRET')");
    expect(source).toContain("req.headers.get('Authorization')");
    expect(source).toContain('Bearer ${webhookSecret}');
    expect(source).toContain("throw new HttpError(401, 'Unauthorized')");
    expect(source).toContain(".eq('is_active', true)");
    expect(source.indexOf("req.headers.get('Authorization')")).toBeLessThan(
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
