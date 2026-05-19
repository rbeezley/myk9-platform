import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const functionPath = resolve(
  process.cwd(),
  '../../supabase/functions/push-trigger-announcement/index.ts'
);

describe('push-trigger-announcement function contract', () => {
  it('requires the service-role bearer before sending announcement push notifications', () => {
    const source = readFileSync(functionPath, 'utf8');

    expect(source).toContain("req.headers.get('Authorization')");
    expect(source).toContain('Bearer ${supabaseServiceKey}');
    expect(source).toContain("new Response('Unauthorized', { status: 401 })");
    expect(source).toContain(".eq('is_active', true)");
    expect(source.indexOf("req.headers.get('Authorization')")).toBeLessThan(
      source.indexOf('webpush.sendNotification')
    );
  });
});
