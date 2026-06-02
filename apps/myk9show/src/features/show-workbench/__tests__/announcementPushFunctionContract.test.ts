import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const functionPath = resolve(
  testDir,
  '../../../../../../supabase/functions/push-trigger-announcement/index.ts'
);
const guardMigrationPath = resolve(
  testDir,
  '../../../../../../supabase/migrations/20260602153923_guard_notify_announcement_push_missing_config.sql'
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

describe('notify_announcement_push config guard', () => {
  const sql = readFileSync(guardMigrationPath, 'utf8');

  it('reads edge-function config with the non-raising two-arg current_setting', () => {
    // The two-arg form returns NULL instead of raising on an unset GUC, so a
    // high/urgent announcement INSERT no longer aborts when push config is absent.
    expect(sql).toContain("current_setting('app.settings.edge_function_base_url', true)");
    expect(sql).toContain("current_setting('app.settings.service_role_key', true)");
  });

  it('skips the webhook (NOTICE + RETURN NEW) instead of failing the INSERT when config is missing', () => {
    expect(sql).toMatch(/RAISE NOTICE[\s\S]*RETURN NEW;/i);
  });

  it('targets the standardized edge_function_base_url path, not the legacy supabase_url GUC', () => {
    expect(sql).toContain("edge_function_base_url || '/push-trigger-announcement'");
    // Must not reintroduce the unset legacy GUC or the raising single-arg form.
    expect(sql).not.toContain("current_setting('app.settings.supabase_url')");
    expect(sql).not.toContain("current_setting('app.settings.service_role_key')");
  });
});
