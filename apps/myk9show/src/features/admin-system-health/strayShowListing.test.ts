import { describe, expect, it } from 'vitest';
import { PUBLIC_SHOW_STATUSES } from '@/services/database/shows/reads.postgrest';
import { PUBLIC_LISTING_STATUSES } from '../../../supabase/functions/_shared/strayShowChecks';

/**
 * MYK9-741 (Codex review): a test-named show that moves on from `published`
 * to `upcoming`, `in_progress` or `completed` is still on the public listing,
 * so the stray-show health check must read every status the listing does.
 */
describe('stray-show check reads the whole public listing', () => {
  it('uses exactly the statuses /shows lists', () => {
    expect([...PUBLIC_LISTING_STATUSES]).toEqual(PUBLIC_SHOW_STATUSES);
  });
});
