import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../../..');
const handlerPath = resolve(
  repoRoot,
  'supabase/functions/send-targeted-message/targeted-message-handler.ts'
);
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260601161000_add_show_message_push_alert.sql'
);
const chatPushHandlerPath = resolve(
  repoRoot,
  'supabase/functions/push-trigger-chat-message/index.ts'
);
const chatVaultMigrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260603085719_notify_chat_message_vault_webhook_secret.sql'
);

describe('targeted message push contract', () => {
  it('adds an explicit push_alert flag to show messages', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain('add column if not exists push_alert boolean not null default true');
  });

  it('writes push_alert from send_push when creating targeted message rows', () => {
    const source = readFileSync(handlerPath, 'utf8');

    expect(source).toContain('send_push?: boolean');
    expect(source).toContain('const sendPush = payload.send_push === true;');
    expect(source).toContain('push_alert: sendPush');
  });

  it('keeps push_alert immutable for ordinary message read updates', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain(
      'create or replace function public.restrict_message_update_columns()'
    );
    expect(migration).toContain('or new.push_alert is distinct from old.push_alert');
    expect(migration).toContain("raise exception 'Only read_at may be updated on show_messages'");
  });

  it('skips chat push when push_alert is false', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain('if new.push_alert is false then');
    expect(migration).toContain('return new;');
  });

  it('skips passcode push fanout when send_push is false', () => {
    const source = readFileSync(handlerPath, 'utf8');

    // Targets default to empty and the ringside/account fan-out only runs inside
    // the send_push guard — so push resolution is skipped entirely when false.
    expect(source).toContain('let ringsideTargets: PushTarget[] = [];');
    expect(source).toContain('if (sendPush) {');
  });

  it('uses current push subscription key columns for account chat pushes', () => {
    const source = readFileSync(chatPushHandlerPath, 'utf8');

    expect(source).toContain(".select('id, user_id, endpoint, p256dh, auth')");
    expect(source).toContain('keys: { p256dh: sub.p256dh, auth: sub.auth }');
    expect(source).not.toContain(".select('id, user_id, endpoint, keys')");
  });
});

describe('chat push Vault + webhook-secret parity', () => {
  it('chat function authenticates against the dedicated PUSH_WEBHOOK_SECRET', () => {
    const source = readFileSync(chatPushHandlerPath, 'utf8');

    expect(source).toContain("Deno.env.get('PUSH_WEBHOOK_SECRET')");
    expect(source).toContain('Bearer ${webhookSecret}');
    expect(source).not.toContain('Bearer ${serviceRoleKey}');
  });

  it('notify_chat_message reads Vault config + webhook secret, not GUCs or the service key', () => {
    const sql = readFileSync(chatVaultMigrationPath, 'utf8');

    expect(sql).toContain('vault.decrypted_secrets');
    expect(sql).toContain("where name = 'edge_function_base_url'");
    expect(sql).toContain("where name = 'push_webhook_secret'");
    expect(sql).toContain("'Bearer ' || webhook_secret");
    expect(sql).not.toContain('current_setting');
    expect(sql).not.toContain("where name = 'service_role_key'");
    // Guard-skip, not raise — a missing secret must not abort the message INSERT.
    expect(sql).toMatch(/raise notice[\s\S]*return new;/i);
    expect(sql).not.toContain('raise exception');
  });

  it('scopes the chat trigger to individual messages to avoid double-pushing broadcasts', () => {
    const sql = readFileSync(chatVaultMigrationPath, 'utf8');

    // Broadcasts (send-targeted-message) set group_label and already push directly.
    expect(sql).toContain('when (new.group_label is null)');
  });

  it('pins search_path on the SECURITY DEFINER function (advisor hardening)', () => {
    const sql = readFileSync(chatVaultMigrationPath, 'utf8');

    expect(sql).toContain("set search_path = ''");
  });
});
