import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const cronSource = readFileSync(
  resolve(__dirname, '../../../supabase/functions/cron-waitlist-expiration/index.ts'),
  'utf8'
);

const emailSource = readFileSync(
  resolve(__dirname, '../../../supabase/functions/send-email/index.ts'),
  'utf8'
);

const promotionMigration = readFileSync(
  resolve(__dirname, '../../../../../supabase/migrations/20260622000222_link_waitlist_promotions.sql'),
  'utf8'
);

describe('waitlist expiration cron payment-link offer wiring', () => {
  it('requests a Stripe payment link for the promoted pending-payment entry', () => {
    expect(cronSource).toContain('createWaitlistPaymentLink(entry.promoted_entry_id, showId)');
    expect(cronSource).toContain('/functions/v1/stripe-payment-link');
    expect(cronSource).toContain("'x-function-secret': cronSecret");
    expect(cronSource).toContain('entry_ids: [entryId]');
  });

  it('does not use the online expiry/payment-link path for mail-in waitlist rows', () => {
    expect(cronSource).toContain("offer.joined_via === 'mail_in'");
    expect(cronSource).toContain("nextInLine.joined_via === 'mail_in'");
    expect(cronSource).toContain('leaving it for secretary handling');
    expect(cronSource).toContain('skippedMailInOffers');
    expect(cronSource).toContain("entry.joined_via !== 'mail_in'");
  });

  it('uses public show redirects for waitlist payment links', () => {
    expect(cronSource).toContain('https://myk9show.com/shows/${showId}?payment=success');
    expect(cronSource).toContain('https://myk9show.com/shows/${showId}?payment=cancelled');
  });

  it('passes the generated payment URL into the waitlist offer email', () => {
    expect(cronSource).toContain('paymentUrl,');
    expect(emailSource).toContain('paymentUrl?: string | null');
    expect(emailSource).toContain('Pay to Claim This Spot');
  });

  it('loads the cron secret from Vault instead of migration text', () => {
    expect(promotionMigration).toContain('vault.decrypted_secrets');
    expect(promotionMigration).toContain("where name = 'cron_secret'");
    expect(promotionMigration).not.toContain('REPLACE_WITH_CRON_SECRET');
  });
});
