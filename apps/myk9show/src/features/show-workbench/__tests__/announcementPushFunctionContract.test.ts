import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const functionPath = resolve(
  testDir,
  '../../../../../../supabase/functions/push-trigger-announcement/index.ts'
);

describe('push-trigger-announcement function contract', () => {
  it('requires the service-role bearer before sending announcement push notifications', () => {
    const source = readFileSync(functionPath, 'utf8');

    expect(source).toContain('if (!supabaseServiceKey)');
    expect(source).toContain("req.headers.get('Authorization')");
    expect(source).toContain('Bearer ${supabaseServiceKey}');
    expect(source).toContain("new Response('Unauthorized', { status: 401 })");
    expect(source).toContain(".eq('is_active', true)");
    expect(source.indexOf("req.headers.get('Authorization')")).toBeLessThan(
      source.indexOf('webpush.sendNotification')
    );
  });
});
