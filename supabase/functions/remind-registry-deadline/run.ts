import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';

import { HttpError } from '../_shared/http/responses.ts';
import {
  buildRegistryDeadlineHtml,
  buildRegistryDeadlineSubject,
  dueRegistryReminders,
  finishListUrl,
} from '../_shared/showCloseout/registryDeadlineReminder.ts';
import { recordEmailLog, type EmailAttempt } from '../_shared/trialPacket/emailLog.ts';
import { sendTrialPacketEmail, TrialPacketProviderError } from '../_shared/trialPacket/email.ts';
import { resolveNamedSecretaryEmails } from './recipients.ts';
import { makeSupabaseStore, type ClaimKey, type ReminderStore } from './store.ts';

const FROM_EMAIL = 'myK9Show <notifications@myk9show.com>';

export interface RunDeps {
  store: ReminderStore;
  /**
   * The show's named secretary with an email; `[]` only for a lookup that succeeded and found
   * nobody. A failed lookup must throw.
   */
  recipientsFor: (showId: string) => Promise<string[]>;
  sendEmail: typeof sendTrialPacketEmail;
  /** One `email_log` row per attempt, so `resend-webhook` can mark a bounce. Never throws. */
  logAttempts: (showId: string, attempts: readonly EmailAttempt[]) => Promise<void>;
  apiKey: string;
  appOrigin: string;
  now: Date;
}

export interface RunSummary {
  /** Reminders every intended recipient has now been accepted for. */
  sent: number;
  alreadyReminded: number;
  noRecipients: number;
  /** A failed lookup, or a reminder with an address the provider has not accepted yet. */
  failed: number;
}

export async function runRegistryDeadlineReminders(deps: RunDeps): Promise<RunSummary> {
  const summary: RunSummary = { sent: 0, alreadyReminded: 0, noRecipients: 0, failed: 0 };
  const candidates = await deps.store.loadCandidates(deps.now);

  for (const candidate of candidates) {
    const due = dueRegistryReminders({
      trials: candidate.trials,
      submissions: candidate.submissions,
      scoreChanges: candidate.scoreChanges,
      now: deps.now,
    });
    for (const reminder of due) {
      // One show or one registry failing must not stop the rest of the run.
      try {
        const key: ClaimKey = {
          showId: candidate.showId,
          registryId: reminder.registryId,
          deadline: reminder.deadline,
        };
        const claim = await deps.store.claim(key, deps.now);
        if (!claim) {
          summary.alreadyReminded += 1;
          continue;
        }
        const accepted = new Set(claim.accepted.map(address => address.toLowerCase()));

        let recipients: string[];
        try {
          recipients = await deps.recipientsFor(candidate.showId);
        } catch (error) {
          // A lookup that failed is not "nobody to tell": release so the next run asks again.
          console.error('remind-registry-deadline: recipient lookup failed', {
            showId: candidate.showId,
            error,
          });
          if (accepted.size === 0) await deps.store.release(key, claim.token);
          summary.failed += 1;
          continue;
        }
        if (recipients.length === 0) {
          // A show with no reachable secretary today may have one tomorrow: keep the slot open.
          if (accepted.size === 0) await deps.store.release(key, claim.token);
          summary.noRecipients += 1;
          continue;
        }

        const outstanding = recipients.filter(address => !accepted.has(address.toLowerCase()));
        if (outstanding.length > 0) {
          const subject = buildRegistryDeadlineSubject(candidate.showName, reminder);
          const html = buildRegistryDeadlineHtml({
            showName: candidate.showName,
            reminder,
            finishUrl: finishListUrl(deps.appOrigin, candidate.showId),
          });
          for (const recipient of outstanding) {
            // Logged the moment this address is settled, not after the loop: a delivery or bounce
            // event for the first message can arrive while the next is still being sent.
            const log = (attempt: EmailAttempt) => deps.logAttempts(candidate.showId, [attempt]);
            try {
              const messageId = await deps.sendEmail({
                apiKey: deps.apiKey,
                // Show, registry, deadline AND recipient: a shared key would make the provider
                // answer every later address with a replay of the first.
                idempotencyKey: `registry-deadline-${key.showId}-${key.registryId}-${key.deadline}-${recipient.toLowerCase()}`,
                from: FROM_EMAIL,
                recipient,
                subject,
                html,
                // resend-webhook retries an event for this type that beats its email_log row.
                tags: [{ name: 'myk9_email_type', value: 'registry_deadline_reminder' }],
              });
              if (!messageId) {
                // A 2xx with no message id is not an acceptance the webhook could ever confirm.
                await log({ recipient, messageId: null, error: 'provider_no_message_id' });
                continue;
              }
              await log({ recipient, messageId, error: null });
              accepted.add(recipient.toLowerCase());
              // Saved per address: a run that dies mid-loop must not mail these again.
              const saved = await deps.store.recordAccepted(key, claim.token, [...accepted]);
              if (!saved) console.error('remind-registry-deadline: accepted list not saved', key);
            } catch (error) {
              const status = error instanceof TrialPacketProviderError ? error.status : null;
              console.error('remind-registry-deadline: send failed', { showId: key.showId, error });
              await log({
                recipient,
                messageId: null,
                error:
                  status === null || status === 'network_error'
                    ? 'email_delivery_error'
                    : `provider_http_${status}`,
              });
            }
          }
        }

        const everyoneReached = recipients.every(address => accepted.has(address.toLowerCase()));
        if (everyoneReached) {
          // The mail is gone. A failed stamp must not throw (a retry would email everyone again).
          let stamped = await deps.store.stampSent(key, claim.token, deps.now, accepted.size);
          if (!stamped)
            stamped = await deps.store.stampSent(key, claim.token, deps.now, accepted.size);
          if (!stamped) console.error('remind-registry-deadline: could not stamp sent_at', key);
          summary.sent += 1;
          continue;
        }
        // Someone is still outstanding. Nobody reached at all: release. Otherwise keep the claim
        // with its accepted list, and a later run (after the lease) mails only the rest.
        if (accepted.size === 0) await deps.store.release(key, claim.token);
        summary.failed += 1;
      } catch (error) {
        console.error('remind-registry-deadline: reminder failed', {
          showId: candidate.showId,
          error,
        });
        summary.failed += 1;
      }
    }
  }
  return summary;
}

/** Production wiring: the service-role client, the environment and the real clock. */
export async function runWithSupabase(supabase: SupabaseClient): Promise<RunSummary> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new HttpError(503, 'Email service not configured.');
  return await runRegistryDeadlineReminders({
    store: makeSupabaseStore(supabase),
    recipientsFor: showId => resolveNamedSecretaryEmails(supabase, showId),
    sendEmail: sendTrialPacketEmail,
    logAttempts: (showId, attempts) =>
      recordEmailLog(supabase, attempts, {
        emailType: 'registry_deadline_reminder',
        showId,
        relatedId: showId,
      }),
    apiKey,
    appOrigin: Deno.env.get('SITE_URL') || 'https://myk9show.com',
    now: new Date(),
  });
}
