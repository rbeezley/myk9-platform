import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(__dirname, '../../../supabase/functions/stripe-payment-link/index.ts'),
  'utf8'
);

describe('stripe-payment-link internal waitlist path', () => {
  it('accepts the cron secret header for trusted waitlist-cascade calls', () => {
    expect(source).toContain("req.headers.get('x-function-secret')");
    expect(source).toContain('internalSecret === cronSecret');
    expect(source).toContain('if (!isInternalCall)');
  });

  it('keeps public callers on the authenticated secretary/admin authorization path', () => {
    expect(source).toContain('supabase.auth.getUser');
    expect(source).toContain("userClient.rpc('is_show_secretary'");
    expect(source).toContain("userClient.rpc('is_club_admin'");
    expect(source).toContain("userClient.rpc('is_site_admin'");
  });

  it('marks cron-created links as service-created instead of inventing a user id', () => {
    expect(source).toContain('created_by: userId');
    expect(source).toContain("userId ?? 'cron'");
  });

  it('shares inactive entry statuses with payment reconciliation', () => {
    expect(source).toContain(
      "import { INACTIVE_ENTRY_STATUSES } from '../_shared/entryPaymentReconcile.ts'"
    );
    expect(source).not.toContain('const INACTIVE_ENTRY_STATUSES = new Set');
  });
});
