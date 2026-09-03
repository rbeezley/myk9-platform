import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

describe('todo reliability batch 1 source contracts', () => {
  it('reports waitlist cron failures and returns a non-success response', () => {
    const source = read('apps/myk9show/supabase/functions/cron-waitlist-expiration/index.ts');
    expect(source).toContain("from 'npm:@sentry/deno@10.62.0'");
    expect(source).toContain('runWithBestEffortCronCheckIn(');
    expect(source).toContain("from '../_shared/alertAdmin.ts'");
    expect(source).toContain("dedupeKey: 'waitlist-expiration-cron-failure'");
    expect(source).toContain('status: results.errors.length === 0 ? 200 : 500');
  });

  it('targets the existing unique subscription identifier for no-subscription upserts', () => {
    const source = read('apps/myk9show/supabase/functions/stripe-webhook/index.ts');
    const start = source.indexOf('stripe_subscription_id: `none_${stripeCustomerId}`');
    const block = source.slice(start, source.indexOf(');', start) + 2);
    expect(block).toContain("onConflict: 'stripe_subscription_id'");
    expect(block).not.toContain("onConflict: 'customer_id'");
    expect(source).toContain('noSubscriptionError');
  });

  it('keeps send-email authorization fail-closed for unknown message types', () => {
    const authz = read('supabase/functions/send-email/authz.ts');
    expect(authz).toContain("args.data.type === 'support_notification'");
    expect(authz).toContain("args.data.type !== 'entry_decision'");
  });

  it('keeps send-email limited to the live message generators', () => {
    const source = read('supabase/functions/send-email/index.ts');
    for (const removedPath of [
      'EntryConfirmationData',
      'PaymentReceiptData',
      'WelcomeEmailData',
      'WaitlistOfferData',
      'generateEntryConfirmationEmail',
      'generatePaymentReceiptEmail',
      'generateWelcomeEmail',
      'generateWaitlistOfferEmail',
    ]) {
      expect(source).not.toContain(removedPath);
    }
    expect(source).toContain('generateEntryDecisionEmail');
    expect(source).toContain('generateSupportNotificationEmail');
  });
});
