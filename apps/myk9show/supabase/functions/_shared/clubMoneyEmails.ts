// The money emails a club receives (MYK9-1986), and the one way they are sent:
// one message per recipient from `loadClubMoneyRecipients`.
//
// Each email names the show and the amount where there is one. None carries bank
// details: no account or routing number, no Stripe account id. A failure the club
// must fix carries the link that fixes it (the club's Payments tab).
//
// Timing wording is today's "typically arrive within 2 business days" from the
// payout cron. No shared five-business-days constant exists yet (MYK9-1956); when
// it does, this file is where the wording changes.

import { sendResendEmailWithRetry } from './resendEmail.ts';

export interface ClubMoneyEmail {
  subject: string;
  html: string;
}

export type SendEmail = (to: string, subject: string, html: string) => Promise<void>;

const DEFAULT_SITE_URL = 'https://myk9show.com';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** The club's Payments tab, where an admin connects or fixes the bank account. */
export function clubPaymentsUrl(siteUrl: string | null | undefined, clubId: string): string {
  const base = (siteUrl || DEFAULT_SITE_URL).replace(/\/+$/, '');
  return `${base}/clubs/${encodeURIComponent(clubId)}?tab=payments`;
}

interface ShowMoneyInput {
  clubName: string;
  showName: string;
  amountCents: number;
}

interface FixLinkInput {
  paymentsUrl: string;
}

function paymentsLink(paymentsUrl: string): string {
  return `<a href="${escapeHtml(paymentsUrl)}">your club's Payments tab</a>`;
}

/** The club has payable money but has never connected a bank account. */
export function connectAccountEmail(input: ShowMoneyInput & FixLinkInput): ClubMoneyEmail {
  const club = escapeHtml(input.clubName);
  const show = escapeHtml(input.showName);
  return {
    subject: `Action needed: connect ${input.clubName}'s bank account`,
    html: `<p>${show} has ${formatDollars(input.amountCents)} in online entry fees ready to send to
       ${club}, but your club hasn't connected its bank account yet.</p>
       <p>A club admin can set this up in about 10 minutes on ${paymentsLink(input.paymentsUrl)}.
       The money waits safely until you do.</p>`,
  };
}

/**
 * The club's bank account or Stripe account needs attention before a show's
 * money can be sent: payouts are off on an onboarded account, or a transfer
 * failed for a reason only the club can fix.
 */
export function bankNeedsAttentionEmail(input: ShowMoneyInput & FixLinkInput): ClubMoneyEmail {
  const club = escapeHtml(input.clubName);
  const show = escapeHtml(input.showName);
  return {
    subject: `Action needed: ${input.clubName}'s bank account needs attention`,
    html: `<p>${formatDollars(input.amountCents)} in online entry fees for <strong>${show}</strong>
       is ready for ${club}, but it can't be sent until the club's bank account is fixed.</p>
       <p>A club admin can see what Stripe needs on ${paymentsLink(input.paymentsUrl)}.
       The money waits safely, and we try again each night.</p>`,
  };
}

/** Stripe switched the club's payouts off (account.updated). Account-level: no single show. */
export function payoutsDisabledEmail(input: { clubName: string } & FixLinkInput): ClubMoneyEmail {
  const club = escapeHtml(input.clubName);
  return {
    subject: `Action needed: ${input.clubName}'s bank account needs attention`,
    html: `<p>Stripe has paused payouts to ${club}'s bank account. Until a club admin fixes it,
       myK9Show can't send the club its online entry fees.</p>
       <p>See what Stripe needs on ${paymentsLink(input.paymentsUrl)}. Money already collected
       waits safely until then.</p>`,
  };
}

/** A transfer was sent. */
export function payoutSentEmail(input: ShowMoneyInput): ClubMoneyEmail {
  const club = escapeHtml(input.clubName);
  const show = escapeHtml(input.showName);
  const amount = formatDollars(input.amountCents);
  return {
    subject: `${amount} on its way to ${input.clubName}`,
    html: `<p>Entry fees for <strong>${show}</strong>, ${amount}, have been sent to ${club}'s
       bank account and typically arrive within 2 business days.</p>
       <p>Questions about the amount? Your show secretary can see the entry-by-entry detail
       in myK9Show.</p>`,
  };
}

/** One message per address. Returns how many sends were attempted. */
export async function sendClubMoneyEmail(
  recipients: readonly string[],
  email: ClubMoneyEmail,
  send: SendEmail
): Promise<number> {
  for (const to of recipients) {
    await send(to, email.subject, email.html);
  }
  return recipients.length;
}

/**
 * Resend-backed sender. Never throws: a failed send is logged, and a money flow
 * never stops because an email could not be sent.
 */
export function createResendSender(apiKey: string | null | undefined, from: string): SendEmail {
  return async (to, subject, html) => {
    if (!apiKey) {
      console.log(`Email skipped (no RESEND_API_KEY): ${subject} -> ${to}`);
      return;
    }
    try {
      const res = await sendResendEmailWithRetry({
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, subject, html }),
      });
      if (!res.ok) console.error(`Email send failed (${res.status}): ${subject} -> ${to}`);
    } catch (err) {
      console.error(`Email send error: ${subject} -> ${to}`, err);
    }
  };
}
