import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const cronSource = readFileSync(
  resolve(__dirname, '../../../supabase/functions/cron-waitlist-expiration/index.ts'),
  'utf8'
);

const promotionMigration = readFileSync(
  resolve(__dirname, '../../../../../supabase/migrations/20260622000222_link_waitlist_promotions.sql'),
  'utf8'
);

describe('waitlist expiration cron offer wiring', () => {
  it('promotes the pending-payment entry through the authoritative database RPC', () => {
    expect(cronSource).toContain("'promote_waitlist_entry_from_cron'");
    expect(cronSource).toContain('p_waitlist_entry_id: entry.id');
  });

  it('does not use the online expiry/payment-link path for mail-in waitlist rows', () => {
    expect(cronSource).toContain("offer.joined_via === 'mail_in'");
    expect(cronSource).toContain("nextInLine.joined_via === 'mail_in'");
    expect(cronSource).toContain('leaving it for secretary handling');
    expect(cronSource).toContain('skippedMailInOffers');
    expect(cronSource).toContain("offer.joined_via === 'mail_in'");
  });

  it('does not create a payment link or send an offer email from the cron', () => {
    expect(cronSource).not.toContain('createWaitlistPaymentLink');
    expect(cronSource).not.toContain('/functions/v1/stripe-payment-link');
    expect(cronSource).not.toContain('sendOfferNotification');
    expect(cronSource).not.toContain("type: 'waitlist_offer'");
  });

  it('loads the cron secret from Vault instead of migration text', () => {
    expect(promotionMigration).toContain('vault.decrypted_secrets');
    expect(promotionMigration).toContain("where name = 'cron_secret'");
    expect(promotionMigration).not.toContain('REPLACE_WITH_CRON_SECRET');
  });

  it('keeps manual waitlist promotion authorization scoped to the owning show or club', () => {
    expect(promotionMigration).toContain('JOIN classes c ON c.id = wl.class_id');
    expect(promotionMigration).toContain('JOIN trials t ON t.id = c.trial_id');
    expect(promotionMigration).toContain('JOIN shows s ON s.id = t.show_id');
    expect(promotionMigration).toContain('public.is_show_secretary(v_show_id)');
    expect(promotionMigration).toContain('public.is_club_admin(v_club_id)');
    expect(promotionMigration).toContain('public.is_site_admin()');
  });

  it('re-checks capacity under a class-level lock before creating a promotion entry', () => {
    expect(promotionMigration).toContain('pg_advisory_xact_lock(hashtext(v_wl.class_id::text))');
    expect(promotionMigration).toContain(
      "e.entry_status IN ('submitted', 'paid', 'confirmed', 'checked-in', 'competing', 'in-ring', 'pending-payment')"
    );
    expect(promotionMigration).toContain('FOR v_judge_id IN');
    expect(promotionMigration).toContain('SELECT DISTINCT ja.person_id');
    expect(promotionMigration).toContain(
      "hashtext('judgeday:' || v_judge_id::text || ':' || v_trial_date::text)"
    );
    expect(promotionMigration).toContain('FROM public.get_judge_day_capacity');
    expect(promotionMigration).toContain("RAISE EXCEPTION 'Judge-day capacity is full'");
    expect(promotionMigration).toContain("RAISE EXCEPTION 'Class is full'");
  });

  it('keeps server judge-day capacity aligned with mail-in auto-release settings', () => {
    expect(promotionMigration).toContain('s.mail_in_auto_release');
    expect(promotionMigration).toContain('s.mail_in_release_date');
    expect(promotionMigration).toContain('v_mail_in_release_date <= CURRENT_DATE');
  });

  it('does not re-offer a just-expired class in the same cron run', () => {
    expect(cronSource).toContain('const classesExpiredThisRun = new Set<string>()');
    expect(cronSource).toContain('classesExpiredThisRun.add(offer.class_id)');
    expect(cronSource).toContain('await processClassesWithOpenSpots(results, classesExpiredThisRun)');
    expect(cronSource).toContain('if (skipClassIds.has(classId))');
  });

  it('answers CORS preflight before requiring the cron secret', () => {
    expect(cronSource.indexOf("req.method === 'OPTIONS'")).toBeLessThan(
      cronSource.indexOf("req.headers.get('Authorization')")
    );
  });

  it('uses a constant-time cron secret comparison', () => {
    expect(cronSource).toContain('async function secretMatches');
    expect(cronSource).toContain("crypto.subtle.digest('SHA-256', enc.encode(provided))");
    expect(cronSource).toContain("crypto.subtle.digest('SHA-256', enc.encode(cronSecret))");
    expect(cronSource).toContain('if (!(await secretMatches(providedSecret)))');
    expect(cronSource).not.toContain('providedSecret !== cronSecret');
  });
});
