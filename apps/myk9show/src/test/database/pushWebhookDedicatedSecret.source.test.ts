import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');
const pushTriggerNames = [
  'push-trigger-announcement',
  'push-trigger-chat-message',
  'push-trigger-support-message',
  'push-trigger-class-status',
  'push-trigger-scoring',
] as const;

function sourceFor(name: (typeof pushTriggerNames)[number]): string {
  return readFileSync(resolve(repoRoot, `supabase/functions/${name}/index.ts`), 'utf8');
}

describe('dedicated push webhook secret integration', () => {
  it.each(pushTriggerNames)('%s authenticates through the shared helper before handling payloads', name => {
    const source = sourceFor(name);

    expect(source).toContain("from '../_shared/pushWebhookAuth.ts'");
    const handler = source.indexOf('handle<WebhookPayload>');
    const auth = source.indexOf('beforeBody: requirePushWebhookSecret');
    const firstPayloadRead = Math.min(
      ...['payload.record', 'body.record', 'body.old_record'].map(needle => {
        const index = source.indexOf(needle);
        return index === -1 ? Number.POSITIVE_INFINITY : index;
      })
    );

    expect(auth).toBeGreaterThan(handler);
    expect(firstPayloadRead).toBeGreaterThan(auth);
    expect(source).not.toContain("Deno.env.get('PUSH_WEBHOOK_SECRET')");
  });

  it.each([
    'push-trigger-announcement',
    'push-trigger-chat-message',
    'push-trigger-class-status',
    'push-trigger-scoring',
  ] as const)('%s never reads the service-role key', name => {
    expect(sourceFor(name)).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('preserves the support trigger service-role bearer only for downstream push delivery', () => {
    const source = sourceFor('push-trigger-support-message');
    const auth = source.indexOf('requirePushWebhookSecret(req);');
    const serviceRoleRead = source.indexOf("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')");
    const downstreamFetch = source.indexOf('/functions/v1/send-push-notification');

    expect(serviceRoleRead).toBeGreaterThan(auth);
    expect(downstreamFetch).toBeGreaterThan(serviceRoleRead);
    expect(source.match(/SUPABASE_SERVICE_ROLE_KEY/g)).toHaveLength(1);
  });
});
