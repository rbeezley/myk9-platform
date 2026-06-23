import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// push-trigger-announcement is a root edge function. Its per-user dedup logic was
// once deployed as an uncommitted hotfix and went missing from source (recovered
// 2026-06-23). This pins the dedup so a future edit/redeploy can't silently drop
// it and reintroduce double-notifications to users with multiple subscriptions.
const source = readFileSync(
  resolve(__dirname, '../../../../../supabase/functions/push-trigger-announcement/index.ts'),
  'utf8'
);

describe('push-trigger-announcement per-user dedup', () => {
  it('dedupes subscriptions by user_id before sending', () => {
    expect(source).toContain('const seenUserIds = new Set<string>()');
    expect(source).toContain('const dedupedSubscriptions = allSubscriptions.filter');
    expect(source).toContain('if (seenUserIds.has(sub.user_id)) return false');
  });

  it('sends to the deduped set, not the raw subscription list', () => {
    expect(source).toContain('dedupedSubscriptions.map(async sub =>');
    expect(source).not.toContain('allSubscriptions.map(async sub =>');
  });
});
