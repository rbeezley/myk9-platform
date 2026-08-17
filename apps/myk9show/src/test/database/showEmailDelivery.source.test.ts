import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('MYK9-180 show email delivery source contract', () => {
  it.each([
    [
      'registration confirmations',
      'supabase/functions/send-registration-email/index.ts',
      'show_id: registration.show_id',
    ],
    [
      'Heritage confirmations',
      'supabase/functions/send-confirmation-email/index.ts',
      'show_id: show.id',
    ],
    [
      'lifecycle emails',
      'supabase/functions/send-lifecycle-email/lifecycle-email-handler.ts',
      'show_id: args.job.show_id',
    ],
    [
      'manual entry decisions',
      'supabase/functions/send-email/index.ts',
      'show_id: authzResult.registration.show.id',
    ],
    [
      'waitlist notifications',
      'supabase/functions/push-trigger-waitlist/index.ts',
      'show_id: input.showId',
    ],
    [
      'registry results submissions',
      'supabase/functions/send-results/index.ts',
      'show_id: show.id',
    ],
  ] as const)('%s writes canonical show_id', (_name, path, marker) => {
    const contents = source(path);
    expect(contents).toContain("from('email_log')");
    expect(contents).toContain(marker);
  });

  it('records the legacy Stripe confirmation orchestrator against its server-loaded cart show', () => {
    const contents = source('apps/myk9show/supabase/functions/stripe-webhook/index.ts');
    expect(contents).toContain("email_type: 'registration_confirmation'");
    expect(contents).toContain('show_id: cart.show_id');
  });

  it.each([
    'supabase/functions/send-auth-email/delivery.ts',
    'supabase/functions/push-trigger-support-message/index.ts',
    'supabase/functions/send-waitlist-invite/index.ts',
    'supabase/functions/admin-invite-user/inviteUserHandler.ts',
  ])('%s remains platform-scoped', path => {
    const contents = source(path);
    expect(contents).not.toContain("email_type: 'registration_confirmation'");
    expect(contents).not.toContain("email_type: 'show_lifecycle_email'");
    expect(contents).not.toContain("email_type: 'waitlist_notification'");
    expect(contents).not.toContain("email_type: 'registry_results_submission'");
  });

  it('keeps the RPC as the only app read surface for delivery history', () => {
    const page = source('apps/myk9show/src/features/messages/pages/SecretaryMessagesPage.tsx');
    expect(page).toContain('DeliveryHistory');
    expect(page).not.toContain("from('email_log')");
  });
});
