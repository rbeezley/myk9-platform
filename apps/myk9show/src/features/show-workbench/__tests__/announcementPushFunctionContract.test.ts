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
  '../../../../../../supabase/migrations/20260602161813_notify_announcement_push_from_vault.sql'
);

describe('push-trigger-announcement function contract', () => {
  it('requires the service-role bearer before sending announcement push notifications', () => {
    const source = readFileSync(functionPath, 'utf8');

    expect(source).toContain('if (!supabaseServiceKey)');
    expect(source).toContain("req.headers.get('Authorization')");
    expect(source).toContain('Bearer ${supabaseServiceKey}');
    expect(source).toContain("throw new HttpError(401, 'Unauthorized')");
    expect(source).toContain(".eq('is_active', true)");
    expect(source.indexOf("req.headers.get('Authorization')")).toBeLessThan(
      source.indexOf('webpush.sendNotification')
    );
  });
});

describe('notify_announcement_push config from Vault', () => {
  const sql = readFileSync(vaultMigrationPath, 'utf8');

  it('reads edge-function config from vault.decrypted_secrets, not GUCs', () => {
    expect(sql).toContain('vault.decrypted_secrets');
    expect(sql).toContain("where name = 'edge_function_base_url'");
    expect(sql).toContain("where name = 'service_role_key'");
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
