/**
 * The sentence a club reads for one show's payout (MYK9-1985).
 *
 * Every show row answers "when do we get paid?" with a date or a deadline, never
 * a status word alone. The dates come from payoutDeadline.ts, the one copy of
 * the five-business-day promise (MYK9-1956).
 *
 * Failures split by whose they are to fix, the same split the payout run makes
 * (supabase/functions/_shared/payoutFailureOwner.ts): a failure stamped
 * `club_account:` is the club's bank account; anything else is the platform's.
 * The payout run picks a show whose last attempt failed up again every night
 * (cron-process-payouts/eligibleShows.ts), so a platform failure needs nothing
 * from the club, and a club failure keeps failing until the account is fixed.
 *
 * Past the promised date, an unsent payout reads as delayed (MYK9-1956 owner
 * decision): a past date is never shown as the expected date.
 *
 * Precedence: a completed payout with money reads Sent; then nothing owed
 * (`owed`, decided once in clubShowReconciliation.ts deriveShowOwed); then a
 * club-account failure; then everything else. No other branch looks at a zero.
 */
import { getTrialTimezone } from '@/features/registries';
import { calendarDateInTimeZone } from '@/utils/calendarDate';
import type { PayoutsAccountState } from './payoutBadge';
import { payoutTimeline, type PayoutTimeline } from './payoutDeadline';

/**
 * Mirror of CLUB_FAILURE_REASON_PREFIX in
 * supabase/functions/_shared/payoutFailureOwner.ts, which the edge function
 * cannot share with the app. payoutStage.test.ts pins the two equal.
 */
export const CLUB_FAILURE_REASON_PREFIX = 'club_account';

export type PayoutStageKind =
  | 'before-due'
  | 'checking'
  | 'sending'
  | 'sent'
  | 'delayed'
  | 'failed-platform'
  | 'failed-club'
  | 'bank-not-connected'
  | 'nothing-to-send'
  | 'unknown';

export type PayoutStageAction = 'fix-bank-account' | 'connect-bank-account';

export interface PayoutStage {
  kind: PayoutStageKind;
  text: string;
  /** A sent payout's instant and the day as the sentence prints it, for a machine-readable <time>. */
  sentOn?: { dateTime: string; label: string };
  /** The control that fixes it, when the club has something to do. */
  action: PayoutStageAction | null;
}

/**
 * Whether the show still owes the club anything, decided ONCE from the
 * reconciliation row and its payout row (clubShowReconciliation.ts
 * deriveShowOwed). 'unknown' (the net cannot be read yet) is read as 'some'.
 */
export type ShowOwed = 'none-refunded' | 'none-no-fees' | 'some' | 'unknown';

export interface PayoutStageInput {
  /** The show's authoritative payout row, or null when none exists yet. */
  payout: {
    status: string;
    failureReason: string | null;
    completedAt: string | null;
    /** What the row sends. Only a completed row with money reads "Sent". */
    amountCents: number;
  } | null;
  accountState: PayoutsAccountState;
  /** The show's last day and timezone, or null when the show could not be read. */
  schedule: { lastDay: string; timeZone: string } | null;
  owed: ShowOwed;
  now: Date;
}

const UNKNOWN_SHOW_DEADLINE = "Paid within five business days of the show's last day.";
const DELAYED = "Your payout is taking longer than usual. We'll be in touch by email.";
const PLATFORM_FAILURE = "We couldn't send this. We're on it, and you don't need to do anything.";

function isClubFailure(reason: string | null): boolean {
  return !!reason && reason.startsWith(`${CLUB_FAILURE_REASON_PREFIX}:`);
}

/** "December 9", with the year only when it is not this year on the show's calendar. */
function formatDay(isoDate: string, today: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  const sameYear = isoDate.slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date);
}

/** "Paid by December 16." on a known schedule, the promise in words otherwise. */
function deadline(timeline: PayoutTimeline | null): string {
  return timeline
    ? `Paid by ${formatDay(timeline.dueDate, timeline.today)}.`
    : UNKNOWN_SHOW_DEADLINE;
}

function stageOf(kind: PayoutStageKind, text: string, action: PayoutStageAction | null = null) {
  return { kind, text, action };
}

export function resolvePayoutStage({
  payout,
  accountState,
  schedule,
  owed,
  now,
}: PayoutStageInput): PayoutStage {
  const timeZone = schedule?.timeZone ?? getTrialTimezone(undefined);
  const timeline = schedule ? payoutTimeline(schedule.lastDay, timeZone, now) : null;
  const status = payout?.status ?? null;

  // 1. Money moved, whatever happened after (a later refund is the club's to settle).
  if (status === 'completed' && (payout?.amountCents ?? 0) > 0) {
    const completedAt = payout?.completedAt ?? null;
    const sentDay = completedAt ? calendarDateInTimeZone(new Date(completedAt), timeZone) : null;
    const today = calendarDateInTimeZone(now, timeZone);
    const label = sentDay ? formatDay(sentDay, today) : null;
    const sent = label ? `Sent ${label}.` : 'Sent.';
    return {
      kind: 'sent',
      text: `${sent} Usually in your account the next business day.`,
      ...(completedAt && label ? { sentOn: { dateTime: completedAt, label } } : {}),
      action: null,
    };
  }

  // 2-3. Nothing owed. The payout run never sends $0: it skips such a show, or
  // closes its parked row at $0, and makes no replacement for a failed one. So
  // no deadline, bank request, delay or fix applies to it.
  if (owed === 'none-refunded') {
    return stageOf(
      'nothing-to-send',
      'Nothing to send. Every entry fee for this show was refunded.'
    );
  }
  if (owed === 'none-no-fees') {
    return stageOf(
      'nothing-to-send',
      'Nothing to send. This show has no online entry fees to pay out.'
    );
  }

  // 4. The club's to fix.
  if (status === 'failed' && isClubFailure(payout?.failureReason ?? null)) {
    return stageOf(
      'failed-club',
      "Your bank account needs attention. We can't send this payout until it's fixed.",
      'fix-bank-account'
    );
  }

  // 5. Everything else.
  if ((status === null || status === 'pending') && accountState === 'not-enabled') {
    return stageOf(
      'bank-not-connected',
      "Waiting for your club's bank account.",
      'connect-bank-account'
    );
  }

  const known = [null, 'pending', 'awaiting_approval', 'approved', 'held', 'processing', 'failed'];
  if (!known.includes(status)) {
    // INTENT: never render a raw database enum to a club.
    return stageOf('unknown', "We can't show where this payout is right now.");
  }

  if (timeline?.pastDue) return stageOf('delayed', DELAYED);

  switch (status) {
    case 'awaiting_approval':
    case 'approved':
    case 'held':
      // A held payout is still only waiting: the club never sees the hold or its reason.
      return stageOf('checking', `Being checked by myK9Show. ${deadline(timeline)}`);
    case 'processing':
      return stageOf('sending', `Being sent now. ${deadline(timeline)}`);
    case 'failed':
      return stageOf(
        'failed-platform',
        timeline ? `${PLATFORM_FAILURE} ${deadline(timeline)}` : PLATFORM_FAILURE
      );
    default:
      if (!timeline) return stageOf('before-due', UNKNOWN_SHOW_DEADLINE);
      return stageOf(
        'before-due',
        timeline.showEnded
          ? deadline(timeline)
          : `Paid within five business days of ${formatDay(timeline.lastDay, timeline.today)}.`
      );
  }
}
