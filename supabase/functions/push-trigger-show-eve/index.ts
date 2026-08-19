import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import webpush from 'npm:web-push@3';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';

import { handle } from '../_shared/http/handler.ts';
import { requirePushWebhookSecret } from '../_shared/pushWebhookAuth.ts';
import { applyActiveRoleValidity } from '../_shared/roleValidity.ts';
import {
  buildShowEveNudgePayload,
  isJudgeAssignedToTrial,
  isTrialNudgeable,
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

  // Staff role rows come in TWO shapes and both must be reached:
  //   * club-wide  (club_id set, show_id null)      — ordinary club staff
  //   * show-scoped (show_id set, club_id may be NULL) — migration 099 wrote
  //     secretaries/chairmen with show_id only, so a club_id filter drops them
  // Two queries rather than one nested `.or()`: applyActiveRoleValidity already
  // contributes an `or` filter, and stacking a second is easy to get subtly
  // wrong. selectShowEveRecipients dedupes the union.
  const roleSelect = 'auth_user_id, is_active, expires_at, club_id, show_id, roles!inner(name)';

  const roleQueries = [
    applyActiveRoleValidity(
      supabase.from('user_roles').select(roleSelect).eq('show_id', trial.show_id)
    ),
  ];
  if (clubId) {
    roleQueries.push(
      applyActiveRoleValidity(
        supabase
          .from('user_roles')
          .select(roleSelect)
          .eq('club_id', clubId)
          .is('show_id', null)
      )
    );
  }

  const clubStaff: ShowEveClubStaffRow[] = [];
  for (const query of roleQueries) {
    const { data, error } = await query;
    if (error) throw error;
    for (const row of data ?? []) {
      clubStaff.push({
        auth_user_id: (row as { auth_user_id: string | null }).auth_user_id,
        role_name: (row as { roles?: { name?: string } }).roles?.name ?? '',
      });
    }
  }

  // Judges are assigned per show rather than by club role, so target them
  // through their assignments and resolve the person to their auth account.
  const { data: assignmentRows, error: assignmentError } = await supabase
    .from('judge_assignments')
    // classes(trial_id) resolves the day for CLASS-level assignments, which
    // store trial_id as null and would otherwise look show-wide.
    .select('status, trial_id, class_id, classes(trial_id), people!inner(auth_user_id, deleted_at)')
    .eq('show_id', trial.show_id)
    // Soft-deleting a person deactivates their user_roles but leaves judge
    // assignments and push subscriptions intact — filter them out here.
    .is('people.deleted_at', null);
  if (assignmentError) throw assignmentError;

  const judges: ShowEveJudgeRow[] = (assignmentRows ?? [])
    // A multi-day show must not nudge Saturday's judge on Sunday's eve.
    .filter(row => {
      const assignment = row as {
        trial_id: string | null;
        class_id: string | null;
        classes?: { trial_id?: string | null } | null;
      };
      return isJudgeAssignedToTrial(
        {
          trial_id: assignment.trial_id,
          class_id: assignment.class_id,
          class_trial_id: assignment.classes?.trial_id ?? null,
        },
        trial.id
      );
    })
    .map(row => ({
      auth_user_id:
        (row as { people?: { auth_user_id?: string | null } }).people?.auth_user_id ?? null,
      status: (row as { status: string | null }).status,
    }));

  return selectShowEveRecipients({ clubStaff, judges });
}

/**
 * Hard bounds on one recipient's fan-out, chosen so the total send time
 * (10 x 8s = 80s worst case) stays far below CLAIM_LEASE_MS. If a send could
 * outlive the lease, the next cron run would reclaim a still-active claim and
 * deliver the same nudge twice.
 */
const PUSH_CALL_TIMEOUT_MS = 8_000;
const PUSH_TIMEOUT_MESSAGE = 'push send timed out';
const MAX_SUBSCRIPTIONS_PER_RECIPIENT = 10;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(PUSH_TIMEOUT_MESSAGE)), ms);
    work.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * 'uncertain' exists because a timed-out push cannot be cancelled: the request
 * may still land. Releasing the claim would risk a duplicate, and stamping it
 * delivered would risk silence — so the claim is left in place and the lease
 * decides, which is exactly what the lease is for.
 */
type SendOutcome = 'delivered' | 'failed' | 'uncertain';

async function sendNudge(
  supabase: SupabaseClient,
  authUserId: string,
  payload: ReturnType<typeof buildShowEveNudgePayload>
): Promise<SendOutcome> {
  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', authUserId);
  if (error) throw error;
  if (!subscriptions?.length) return 'failed';

  const expiredEndpoints: string[] = [];
  let delivered = false;
  let timedOut = false;

  for (const sub of subscriptions.slice(0, MAX_SUBSCRIPTIONS_PER_RECIPIENT)) {
    try {
      await withTimeout(
        webpush.sendNotification(
          {
            endpoint: (sub as { endpoint: string }).endpoint,
            keys: {
              p256dh: (sub as { p256dh: string }).p256dh,
              auth: (sub as { auth: string }).auth,
            },
          },
          JSON.stringify(payload)
        ),
        PUSH_CALL_TIMEOUT_MS
      );
      delivered = true;
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 410 || statusCode === 404) {
        expiredEndpoints.push((sub as { endpoint: string }).endpoint);
      } else if (err instanceof Error && err.message === PUSH_TIMEOUT_MESSAGE) {
        // The request was not cancelled and may still be delivered.
        timedOut = true;
      }
    }
  }

  if (expiredEndpoints.length > 0) {
    try {
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', authUserId)
        .in('endpoint', expiredEndpoints);
    } catch {
      // Housekeeping only. Letting this throw would unwind a push that was
      // already delivered, and the caller would release the claim and send
      // the same nudge again on the next run.
    }
  }

  if (delivered) return 'delivered';
  return timedOut ? 'uncertain' : 'failed';
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
    // Trial-level state filters only. The SHOW-level checks run in TS via
    // isTrialNudgeable: embedded PostgREST filters must name the SELECT alias
    // (`show`, not `shows`) and `neq` never matches NULL — both silent ways to
    // drop every trial or announce a cancelled one.
    .or('status.is.null,status.neq.cancelled')
    .is('deleted_at', null);
  if (trialsError) throw trialsError;

  let notified = 0;
  let skipped = 0;
  // A push that went out but whose ledger stamp failed: the send succeeded, so
  // it counts as notified, but the claim may later look abandoned and be
  // retried. Surfaced rather than hidden.
  let unstamped = 0;

  const nudgeableTrials = ((trials ?? []) as unknown as TrialRow[]).filter(isTrialNudgeable);

  for (const trial of nudgeableTrials) {
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

      let outcome: SendOutcome = 'failed';
      try {
        outcome = await sendNudge(supabase, authUserId, payload);
      } catch {
        // A transient lookup failure must not leave the claim behind: every
        // later run would read the unique conflict as "already sent" and skip
        // this person forever, having never delivered anything.
        outcome = 'failed';
      }

      if (outcome === 'uncertain') {
        // Leave the claim exactly as it is. If the timed-out request landed,
        // nobody gets a second buzz; if it did not, the lease expires and a
        // later run in this window retries.
        skipped += 1;
        continue;
      }

      if (outcome === 'delivered') {
        // Mark the claim as genuinely completed so no later run reclaims it.
        // Conditional on still holding this claim: if a send outlived the
        // lease and another run reclaimed it, that run owns the outcome.
        const stampDelivered = async () =>
          await supabase
            .from('show_eve_nudge_log')
            .update({ delivered_at: new Date().toISOString() })
            .eq('trial_id', trial.id)
            .eq('auth_user_id', authUserId)
            .eq('claimed_at', claimToken)
            .select('id');

        let stamp = await stampDelivered();
        // An empty data array is NOT success: it means another invocation
        // reclaimed or removed this claim, so nothing recorded our delivery.
        if (stamp.error || !stamp.data?.length) stamp = await stampDelivered();
        if (stamp.error || !stamp.data?.length) {
          // The push WAS delivered; only the bookkeeping failed or the claim
          // was lost. Never delete the claim here — that would guarantee a
          // duplicate next run.
          unstamped += 1;
        }
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

  return { trialDate, trials: nudgeableTrials.length, notified, skipped, unstamped };
});
