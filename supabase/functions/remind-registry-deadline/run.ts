import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';

import { HttpError } from '../_shared/http/responses.ts';
import {
  buildRegistryDeadlineHtml,
  buildRegistryDeadlineSubject,
  dueRegistryReminders,
  finishListUrl,
} from '../_shared/showCloseout/registryDeadlineReminder.ts';
import {
  loadPacketRoleRows,
  loadPacketShow,
  resolveRecipients,
} from '../_shared/trialPacket/deliverStoredPacket.ts';
import { sendTrialPacketEmail } from '../_shared/trialPacket/email.ts';
import { makeSupabaseStore, type ClaimKey, type ReminderStore } from './store.ts';

const FROM_EMAIL = 'myK9Show <notifications@myk9show.com>';

export interface RunDeps {
  store: ReminderStore;
  /** The show's secretary and club admins with an email; empty when none can be reached. */
  recipientsFor: (showId: string) => Promise<string[]>;
  sendEmail: typeof sendTrialPacketEmail;
  apiKey: string;
  appOrigin: string;
  now: Date;
}

export interface RunSummary {
  sent: number;
  alreadyReminded: number;
  noRecipients: number;
  failed: number;
}

export async function runRegistryDeadlineReminders(deps: RunDeps): Promise<RunSummary> {
  const summary: RunSummary = { sent: 0, alreadyReminded: 0, noRecipients: 0, failed: 0 };
  const candidates = await deps.store.loadCandidates(deps.now);

  for (const candidate of candidates) {
    const due = dueRegistryReminders({
      trials: candidate.trials,
      submissions: candidate.submissions,
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
        const token = await deps.store.claim(key, deps.now);
        if (!token) {
          summary.alreadyReminded += 1;
          continue;
        }

        const recipients = await deps.recipientsFor(candidate.showId).catch(() => [] as string[]);
        if (recipients.length === 0) {
          // A show with no reachable official today may have one tomorrow: keep the slot open.
          await deps.store.release(key, token);
          summary.noRecipients += 1;
          continue;
        }

        const subject = buildRegistryDeadlineSubject(candidate.showName, reminder);
        const html = buildRegistryDeadlineHtml({
          showName: candidate.showName,
          reminder,
          finishUrl: finishListUrl(deps.appOrigin, candidate.showId),
        });

        let delivered = 0;
        for (const recipient of recipients) {
          try {
            await deps.sendEmail({
              apiKey: deps.apiKey,
              // Show, registry, deadline AND recipient: a shared key would make the provider
              // answer every later address with a replay of the first.
              idempotencyKey: `registry-deadline-${key.showId}-${key.registryId}-${key.deadline}-${recipient.toLowerCase()}`,
              from: FROM_EMAIL,
              recipient,
              subject,
              html,
            });
            delivered += 1;
          } catch (error) {
            console.error('remind-registry-deadline: send failed', { showId: key.showId, error });
          }
        }

        if (delivered === 0) {
          // Nobody was reached: release, so a later run in the window tries again.
          await deps.store.release(key, token);
          summary.failed += 1;
          continue;
        }

        // The mail is gone. A failed stamp must not throw (a retry would email everyone again).
        let stamped = await deps.store.stampSent(key, token, deps.now, delivered);
        if (!stamped) stamped = await deps.store.stampSent(key, token, deps.now, delivered);
        if (!stamped) console.error('remind-registry-deadline: could not stamp sent_at', key);
        summary.sent += 1;
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
    recipientsFor: async showId => {
      const show = await loadPacketShow(supabase, showId);
      try {
        return await resolveRecipients(supabase, show, await loadPacketRoleRows(supabase, show));
      } catch (error) {
        // `resolveRecipients` says "nobody to email" as a 422; anything else is a real failure.
        if (error instanceof HttpError && error.status === 422) return [];
        throw error;
      }
    },
    sendEmail: sendTrialPacketEmail,
    apiKey,
    appOrigin: Deno.env.get('SITE_URL') || 'https://myk9show.com',
    now: new Date(),
  });
}
