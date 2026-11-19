// Stripe switched a club's payouts off: email the club's admins and contact
// address once, with the link that fixes it (MYK9-1986), and raise one
// operator alert for the same episode (MYK9-2191).
//
// "Once" is the database transition itself: an UPDATE that only matches a row
// whose payouts_enabled is still true. The first account.updated that turns
// payouts off flips the row and is the only one that sees it come back; every
// later account.updated (Stripe sends many, and re-delivers) matches nothing.
// Payouts turning back on and off again is a new episode and emails again.
// The operator alert rides the same claim, so the two never disagree.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';
import { loadClubMoneyRecipients } from '../_shared/clubMoneyRecipients.ts';
import {
  clubPaymentsUrl,
  escapeHtml,
  payoutsDisabledEmail,
  sendClubMoneyEmail,
  type SendEmail,
} from '../_shared/clubMoneyEmails.ts';

/** The shows.status values a visitor can see, less 'completed' (no entries left to pause). */
const OPEN_SHOW_STATUSES = ['published', 'upcoming', 'in_progress'] as const;

/** The alert lists at most this many shows; the lookup fetches one more to know there are more. */
export const ALERT_SHOW_LIMIT = 20;

/**
 * Upper bound on the operator alert (shows lookup, operator_alerts insert,
 * alert email). It runs before the account row patch and the webhook's 200,
 * and Stripe gives a delivery about 10 seconds before it calls it failed and
 * retries; the club email already spends part of that. A healthy alert is
 * well under a second, so 3 seconds leaves room for one slow call without
 * letting a hung connection hold the webhook.
 */
export const OPERATOR_ALERT_TIMEOUT_MS = 3000;

export interface PublicShow {
  name: string;
  start_date: string;
  end_date: string;
}

/** `alertAdmin` from `_shared/alertAdmin.ts`, injected (it reads Deno.env at load). */
export type OperatorAlert = (
  subject: string,
  html: string,
  opts: { source: string; severity: 'warn'; dedupeKey: string }
) => Promise<void>;

export interface PayoutsOffOperatorContext {
  alert: OperatorAlert;
  /** The Stripe event that claimed the transition: unique per off-episode. */
  eventId: string;
  livemode: boolean;
}

export interface PayoutsDisabledDeps {
  /** Flip payouts_enabled true -> false; returns the club ids whose row actually flipped. */
  claimPayoutsTurnedOff: () => Promise<string[]>;
  loadClub: (clubId: string) => Promise<{ name: string; email: string | null } | null>;
  loadRecipients: (clubId: string, contactEmail: string | null) => Promise<string[]>;
  /** Up to ALERT_SHOW_LIMIT + 1 of the club's public shows by start date; throws when the read fails. */
  loadPublicShows: (clubId: string) => Promise<PublicShow[]>;
  send: SendEmail;
  siteUrl: string | null | undefined;
  stripeAccountId: string;
  operator: PayoutsOffOperatorContext;
}

function showLine(show: PublicShow): string {
  const dates =
    show.start_date === show.end_date ? show.start_date : `${show.start_date} to ${show.end_date}`;
  return `<li>${escapeHtml(`${show.name}, ${dates}`)}</li>`;
}

export function payoutsTurnedOffAlertHtml(input: {
  clubName: string;
  stripeAccountId: string;
  livemode: boolean;
  shows: PublicShow[] | null;
  paymentsUrl: string;
}): string {
  const showsHtml =
    input.shows === null
      ? `<p>We could not load this club's shows. Check them on the club page.</p>`
      : input.shows.length === 0
        ? `<p>The club has no shows open to the public right now.</p>`
        : `<p>Shows open to the public:</p><ul>${input.shows
            .slice(0, ALERT_SHOW_LIMIT)
            .map(showLine)
            .join('')}</ul>${
            input.shows.length > ALERT_SHOW_LIMIT ? '<p>And more: see the club page.</p>' : ''
          }`;
  return `<p>Stripe turned off payouts for <strong>${escapeHtml(input.clubName)}</strong>
     (account <code>${escapeHtml(input.stripeAccountId)}</code>, ${input.livemode ? 'live mode' : 'test mode'}).</p>
     <p>Card entries for this club's shows are paused until the club fixes its Stripe account.
     Money already collected waits. Check and cash entries continue.</p>
     ${showsHtml}
     <p>This alert does not confirm that the club was notified. Check the function log or
     contact the club. See the club's
     <a href="${escapeHtml(input.paymentsUrl)}">Payments tab</a>.</p>`;
}

/**
 * Best-effort and bounded: logs and swallows every failure, and gives up
 * waiting after OPERATOR_ALERT_TIMEOUT_MS, so the webhook's own work goes on.
 * Awaited, not fire-and-forget: the edge runtime may stop un-awaited work
 * once the response is sent.
 */
async function alertOperator(
  deps: PayoutsDisabledDeps,
  clubId: string,
  club: { name: string } | null
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<'timeout'>(resolve => {
    timer = setTimeout(() => resolve('timeout'), OPERATOR_ALERT_TIMEOUT_MS);
  });
  try {
    const outcome = await Promise.race([raiseOperatorAlert(deps, clubId, club), timedOut]);
    if (outcome === 'timeout') {
      console.error(
        `Payouts-turned-off operator alert for club ${clubId} gave up after ${OPERATOR_ALERT_TIMEOUT_MS}ms`
      );
    }
  } catch (err) {
    console.error(`Payouts-turned-off operator alert failed for club ${clubId}:`, err);
  } finally {
    clearTimeout(timer);
  }
}

async function raiseOperatorAlert(
  deps: PayoutsDisabledDeps,
  clubId: string,
  club: { name: string } | null
): Promise<'done'> {
  let shows: PublicShow[] | null = null;
  try {
    shows = await deps.loadPublicShows(clubId);
  } catch (err) {
    console.error(`Payouts-turned-off alert: shows lookup failed for club ${clubId}:`, err);
  }
  const clubName = club?.name ?? `club ${clubId}`;
  await deps.operator.alert(
    `Stripe turned off payouts for ${clubName}`,
    payoutsTurnedOffAlertHtml({
      clubName,
      stripeAccountId: deps.stripeAccountId,
      livemode: deps.operator.livemode,
      shows,
      paymentsUrl: clubPaymentsUrl(deps.siteUrl, clubId),
    }),
    {
      source: 'stripe-webhook',
      severity: 'warn',
      dedupeKey: `payouts-turned-off-${clubId}-${deps.operator.eventId}`,
    }
  );
  return 'done';
}

/**
 * Run BEFORE the general account.updated row patch, which would otherwise set
 * payouts_enabled=false first and leave no transition to claim. Never throws.
 * Per claimed club: the club email first, then the operator alert. Returns
 * how many messages were sent to the club.
 */
export async function notifyPayoutsTurnedOff(
  deps: PayoutsDisabledDeps,
  patch: { payouts_enabled: boolean }
): Promise<number> {
  if (patch.payouts_enabled) return 0;
  let clubIds: string[];
  try {
    clubIds = await deps.claimPayoutsTurnedOff();
  } catch (err) {
    console.error('Payouts-turned-off club email failed:', err);
    return 0;
  }
  let sent = 0;
  for (const clubId of clubIds) {
    let club: { name: string; email: string | null } | null = null;
    try {
      club = await deps.loadClub(clubId);
      if (club) {
        const recipients = await deps.loadRecipients(clubId, club.email);
        sent += await sendClubMoneyEmail(
          recipients,
          payoutsDisabledEmail({
            clubName: club.name,
            paymentsUrl: clubPaymentsUrl(deps.siteUrl, clubId),
          }),
          deps.send
        );
      }
    } catch (err) {
      console.error('Payouts-turned-off club email failed:', err);
    }
    await alertOperator(deps, clubId, club);
  }
  return sent;
}

/** The database side of the deps, for one Stripe account id. */
export function createPayoutsDisabledDeps(
  supabase: SupabaseClient,
  stripeAccountId: string,
  send: SendEmail,
  siteUrl: string | null | undefined,
  operator: PayoutsOffOperatorContext
): PayoutsDisabledDeps {
  return {
    claimPayoutsTurnedOff: async () => {
      const { data, error } = await supabase
        .from('club_stripe_accounts')
        .update({ payouts_enabled: false })
        .eq('stripe_account_id', stripeAccountId)
        .eq('payouts_enabled', true)
        .select('club_id');
      if (error) {
        console.error(`Payouts-off transition failed for ${stripeAccountId}:`, error);
        return [];
      }
      return ((data ?? []) as Array<{ club_id: string }>).map(row => row.club_id);
    },
    loadClub: async clubId => {
      const { data } = await supabase
        .from('clubs')
        .select('name, email')
        .eq('id', clubId)
        .maybeSingle();
      return (data as { name: string; email: string | null } | null) ?? null;
    },
    loadRecipients: (clubId, contactEmail) =>
      loadClubMoneyRecipients(supabase, clubId, contactEmail),
    loadPublicShows: async clubId => {
      const { data, error } = await supabase
        .from('shows')
        .select('name, start_date, end_date')
        .eq('club_id', clubId)
        .in('status', [...OPEN_SHOW_STATUSES])
        .is('deleted_at', null)
        .order('start_date')
        .limit(ALERT_SHOW_LIMIT + 1);
      if (error) throw new Error(error.message);
      return (data ?? []) as PublicShow[];
    },
    send,
    siteUrl,
    stripeAccountId,
    operator,
  };
}
