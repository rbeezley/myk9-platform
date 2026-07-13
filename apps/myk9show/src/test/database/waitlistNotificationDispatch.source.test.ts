import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../../../..');
const migrationPath = resolve(
  root,
  'supabase/migrations/20260713010000_waitlist_notification_events.sql'
);
const dispatcherPath = resolve(root, 'supabase/functions/push-trigger-waitlist/index.ts');
const dispatcherContentPath = resolve(
  root,
  'supabase/functions/push-trigger-waitlist/waitlistNotification.ts'
);
const cronPath = resolve(
  root,
  'apps/myk9show/supabase/functions/cron-waitlist-expiration/index.ts'
);
const cronDispatchPath = resolve(
  root,
  'apps/myk9show/supabase/functions/_shared/waitlistNotificationDispatch.ts'
);
const rollbackPath = resolve(root, 'scripts/qa/rollback-waitlist-notification-events.sql');
const vitestConfigPath = resolve(root, 'apps/myk9show/vitest.config.ts');

describe('waitlist notification dispatch contracts', () => {
  it('persists one retryable event per waitlist offer cycle and event type', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    const compact = migration.replace(/\s+/g, ' ');

    expect(migration).toContain('CREATE TABLE public.waitlist_notification_events');
    expect(compact).toContain('UNIQUE (waitlist_entry_id, offer_cycle_at, event_type)');
    expect(migration).toContain("CHECK (status IN ('pending', 'processing', 'sent', 'failed'))");
    expect(migration).toContain('attempt_count integer NOT NULL DEFAULT 0');
    expect(migration).toContain('claim_token uuid');
    expect(migration).toContain("push_delivered_endpoint_hashes text[] NOT NULL DEFAULT '{}'");
    expect(migration).toContain('last_error text');
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION public.claim_waitlist_notification_event'
    );
    expect(migration).toContain('attempt_count = event.attempt_count + 1');
    expect(migration).toContain("event.status IN ('pending', 'failed')");
    expect(migration).toContain("event.processing_started_at <= now() - interval '10 minutes'");
    expect(migration).toContain('public.renew_waitlist_notification_claim');
    expect(migration).toContain('public.record_waitlist_push_delivery');
    expect(migration).toContain('public.list_retryable_waitlist_notification_events');
    expect(migration).toContain('public.enqueue_due_waitlist_reminder_events');
    expect(migration).toContain("existing.event_type = 'reminder'");
    expect(migration).toContain('FOR UPDATE OF waitlist SKIP LOCKED');
  });

  it('enqueues and invokes offered delivery from the committed database transition', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    const compact = migration.replace(/\s+/g, ' ');

    expect(migration).toContain('CREATE TRIGGER trg_waitlist_offer_notification');
    expect(compact).toContain("new.status = 'offered' AND old.status IS DISTINCT FROM 'offered'");
    expect(migration).toContain("edge_function_base_url || '/push-trigger-waitlist'");
    expect(migration).toContain("'Authorization', 'Bearer ' || webhook_secret");
    expect(migration).toContain("'event_type', 'offered'");
    expect(migration).toContain('EXCEPTION WHEN OTHERS THEN');

    const rollback = readFileSync(rollbackPath, 'utf8');
    expect(rollback).toContain('DROP TRIGGER IF EXISTS trg_waitlist_offer_notification');
    expect(rollback).toContain('DROP FUNCTION IF EXISTS public.claim_waitlist_notification_event');
    expect(rollback).toContain('DROP TABLE IF EXISTS public.waitlist_notification_events');
  });

  it('requires the dedicated push secret and links to the existing My Entries surface', () => {
    const dispatcher = readFileSync(dispatcherPath, 'utf8');
    const content = readFileSync(dispatcherContentPath, 'utf8');

    expect(dispatcher).toContain("from '../_shared/pushWebhookAuth.ts'");
    expect(dispatcher).toContain('beforeBody: requirePushWebhookSecret');
    expect(dispatcher).not.toContain("Deno.env.get('PUSH_WEBHOOK_SECRET')");
    expect(dispatcher).toContain('if (!input.authUserId) {');
    expect(dispatcher).not.toContain(
      '!exhibitor.person?.email || !exhibitor.person.auth_user_id'
    );
    expect(dispatcher).not.toContain("throw new Error('notification_recipient_missing')");
    expect(dispatcher).toContain('if (!input.recipient) {');
    expect(content).toContain('/exhibitor/entries?waitlistOffer=');
    expect(dispatcher).toContain("event_type: 'offered' | 'reminder' | 'expired'");
    expect(dispatcher).toContain('shouldDeliverWaitlistEvent');
    expect(dispatcher).toContain('runWaitlistDeliveryChannels');
    expect(dispatcher).toContain(".eq('claim_token', claimToken)");
    expect(dispatcher).toContain('record_waitlist_push_delivery');
  });

  it('makes cron enqueue reminder and expiry events without sending offer email directly', () => {
    const cron = readFileSync(cronPath, 'utf8');
    const migration = readFileSync(migrationPath, 'utf8');
    const cronSupport = readFileSync(cronDispatchPath, 'utf8');
    const combined = `${cron}\n${cronSupport}`;

    expect(combined).toContain('processHalfwayReminders');
    expect(combined).toContain('retryWaitlistNotificationEvents');
    expect(combined).toContain('AbortSignal.timeout(DISPATCH_TIMEOUT_MS)');
    expect(combined).toContain('DISPATCH_CONCURRENCY = 3');
    expect(cron.indexOf('await processClassesWithOpenSpots')).toBeLessThan(
      cron.indexOf('const expiryDelivery')
    );
    expect(migration).toContain("existing.event_type = 'reminder'");
    expect(cron).toContain("eventType: 'expired'");
    expect(migration).toContain("waitlist.joined_via IS DISTINCT FROM 'mail_in'");
    expect(migration).toContain("entry.payment_status IS DISTINCT FROM 'paid'");
    expect(cron).not.toContain('sendOfferNotification');
    expect(cron).not.toContain("type: 'waitlist_offer'");

    const vitestConfig = readFileSync(vitestConfigPath, 'utf8');
    expect(vitestConfig).toContain(
      '../../supabase/functions/push-trigger-waitlist/waitlistNotification.test.ts'
    );
  });
});
