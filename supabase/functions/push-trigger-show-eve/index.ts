import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import webpush from 'npm:web-push@3';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';

import { handle } from '../_shared/http/handler.ts';
import { requirePushWebhookSecret } from '../_shared/pushWebhookAuth.ts';
import { applyActiveRoleValidity } from '../_shared/roleValidity.ts';
import {
  buildShowEveNudgePayload,
  isJudgeAssignedToTrial,
  shouldReclaimStaleClaim,
  selectShowEveRecipients,
  type ShowEveClubStaffRow,
  type ShowEveJudgeRow,
} from '../_shared/showEveNudge.ts';

/**
 * push-trigger-show-eve (MYK9-203) — the evening before a trial day, remind
 * the people who will RUN that day to open the show while they still have
 * internet, so their device carries it to a venue that may not have any.
 *
 * Invoked by pg_cron. Idempotent: every (trial, recipient) pair it notifies is
 * recorded in `show_eve_nudge_log`, so a re-run in the same window is a no-op.
 */

interface TrialRow {
  id: string;
  date: string;
  show_id: string;
  show: {
    id: string;
    name: string | null;
    club_id: string | null;
    status: string | null;
    deleted_at: string | null;
  } | null;
}

function targetTrialDate(now: Date): string {
  const tomorrow = new Date(now.getTime());
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return tomorrow.toISOString().slice(0, 10);
}

async function loadRecipients(supabase: SupabaseClient, trial: TrialRow): Promise<string[]> {
  const clubId = trial.show?.club_id ?? null;

  // Staff roles in this repo are CLUB-scoped (verified: zero show-scoped rows),
  // so club membership is how show-day staff are reached.
  const clubStaff: ShowEveClubStaffRow[] = [];
  if (clubId) {
    // A role can be active but EXPIRED; the shared helper carries the repo's
    // role-validity contract (active AND not expired) so this handler cannot
    // drift to an is_active-only check.
    const { data, error } = await applyActiveRoleValidity(
      supabase
        .from('user_roles')
        .select('auth_user_id, is_active, expires_at, show_id, roles!inner(name)')
        .eq('club_id', clubId)
        // grant_show_official writes SHOW-scoped rows that still carry the
        // club id, so a club_id-only filter would nudge officials assigned to
        // a different show of the same club.
        .or(`show_id.is.null,show_id.eq.${trial.show_id}`)
    );
    if (error) throw error;
    for (const row of data ?? []) {
      const roleName = (row as { roles?: { name?: string } }).roles?.name ?? '';
      clubStaff.push({
        auth_user_id: (row as { auth_user_id: string | null }).auth_user_id,
        role_name: roleName,
      });
    }
  }

  // Judges are assigned per show rather than by club role, so target them
  // through their assignments and resolve the person to their auth account.
  const { data: assignmentRows, error: assignmentError } = await supabase
    .from('judge_assignments')
    .select('status, trial_id, people!inner(auth_user_id, deleted_at)')
    .eq('show_id', trial.show_id)
    // Soft-deleting a person deactivates their user_roles but leaves judge
    // assignments and push subscriptions intact — filter them out here.
    .is('people.deleted_at', null);
  if (assignmentError) throw assignmentError;

  const judges: ShowEveJudgeRow[] = (assignmentRows ?? [])
    // A multi-day show must not nudge Saturday's judge on Sunday's eve.
    .filter(row => isJudgeAssignedToTrial(row as { trial_id: string | null }, trial.id))
    .map(row => ({
      auth_user_id:
        (row as { people?: { auth_user_id?: string | null } }).people?.auth_user_id ?? null,
      status: (row as { status: string | null }).status,
    }));

  return selectShowEveRecipients({ clubStaff, judges });
}

async function sendNudge(
  supabase: SupabaseClient,
  authUserId: string,
  payload: ReturnType<typeof buildShowEveNudgePayload>
): Promise<boolean> {
  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', authUserId);
  if (error) throw error;
  if (!subscriptions?.length) return false;

  const expiredEndpoints: string[] = [];
  let delivered = false;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: (sub as { endpoint: string }).endpoint,
          keys: {
            p256dh: (sub as { p256dh: string }).p256dh,
            auth: (sub as { auth: string }).auth,
          },
        },
        JSON.stringify(payload)
      );
      delivered = true;
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 410 || statusCode === 404) {
        expiredEndpoints.push((sub as { endpoint: string }).endpoint);
      }
    }
  }

  if (expiredEndpoints.length > 0) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', authUserId)
      .in('endpoint', expiredEndpoints);
  }

  return delivered;
}

handle({ auth: 'none', beforeBody: requirePushWebhookSecret }, async ({ supabase }) => {
  webpush.setVapidDetails(
    `mailto:${Deno.env.get('VAPID_CONTACT_EMAIL') ?? 'support@myk9show.com'}`,
    Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
    Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
  );

  const trialDate = targetTrialDate(new Date());

  const { data: trials, error: trialsError } = await supabase
    .from('trials')
    .select('id, date, show_id, show:shows!inner(id, name, club_id, status, deleted_at)')
    .eq('date', trialDate)
    // Never announce a trial that will not run: cancelled or soft-deleted
    // trials, and trials whose show was cancelled or soft-deleted.
    .neq('status', 'cancelled')
    .is('deleted_at', null)
    .neq('shows.status', 'cancelled')
    .is('shows.deleted_at', null);
  if (trialsError) throw trialsError;

  let notified = 0;
  let skipped = 0;

  for (const trial of (trials ?? []) as unknown as TrialRow[]) {
    const showName = trial.show?.name ?? 'Your show';
    const payload = buildShowEveNudgePayload({
      showName,
      showId: trial.show_id,
      trialDate: trial.date,
    });

    const recipients = await loadRecipients(supabase, trial);

    for (const authUserId of recipients) {
      // Claim the (trial, recipient) pair FIRST. The unique constraint makes a
      // concurrent or repeated cron run a no-op instead of a second buzz.
      // Generate the claim token ourselves so every later write can be
      // conditional on holding THIS claim.
      let claimToken = new Date().toISOString();
      const { error: claimError } = await supabase
        .from('show_eve_nudge_log')
        .insert({ trial_id: trial.id, auth_user_id: authUserId, claimed_at: claimToken });

      if (claimError) {
        // A row already exists. That is only proof of DELIVERY if delivered_at
        // is set; otherwise it may be a claim abandoned by a crashed run, and
        // treating it as sent would suppress this person's nudge forever.
        const { data: existing } = await supabase
          .from('show_eve_nudge_log')
          .select('claimed_at, delivered_at')
          .eq('trial_id', trial.id)
          .eq('auth_user_id', authUserId)
          .maybeSingle();

        if (!existing || !shouldReclaimStaleClaim(existing, Date.now())) {
          skipped += 1;
          continue;
        }

        // Compare-and-swap, not a bare update: runs overlap on the 15-minute
        // schedule, and both could read the same stale claim and send. Only
        // the invocation whose update actually matches (still undelivered,
        // still holding the claim we read) proceeds.
        const reclaimToken = new Date().toISOString();
        const { data: reclaimed } = await supabase
          .from('show_eve_nudge_log')
          .update({ claimed_at: reclaimToken })
          .eq('trial_id', trial.id)
          .eq('auth_user_id', authUserId)
          .eq('claimed_at', existing.claimed_at)
          .is('delivered_at', null)
          .select('id');

        if (!reclaimed?.length) {
          skipped += 1;
          continue;
        }
        claimToken = reclaimToken;
      }

      let delivered = false;
      try {
        delivered = await sendNudge(supabase, authUserId, payload);
      } catch {
        // A transient lookup/cleanup failure must not leave the claim behind:
        // every later run would read the unique conflict as "already sent" and
        // skip this person forever, having never delivered anything.
        delivered = false;
      }

      if (delivered) {
        // Mark the claim as genuinely completed so no later run reclaims it.
        // Conditional on still holding this claim: if a send outlived the
        // lease and another run reclaimed it, that run owns the outcome.
        await supabase
          .from('show_eve_nudge_log')
          .update({ delivered_at: new Date().toISOString() })
          .eq('trial_id', trial.id)
          .eq('auth_user_id', authUserId)
          .eq('claimed_at', claimToken);
        notified += 1;
      } else {
        // Nothing was delivered (no usable subscription, or a transient
        // failure) — release the claim so a later run can retry.
        // Only release a claim we still hold, and never delete one another
        // run has already marked delivered.
        await supabase
          .from('show_eve_nudge_log')
          .delete()
          .eq('trial_id', trial.id)
          .eq('auth_user_id', authUserId)
          .eq('claimed_at', claimToken)
          .is('delivered_at', null);
        skipped += 1;
      }
    }
  }

  return { trialDate, trials: trials?.length ?? 0, notified, skipped };
});
