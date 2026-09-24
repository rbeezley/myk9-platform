// Plain, large-type email copy for access-request notifications. Written for
// people who may not revisit the site on their own: every message says what
// happened, whether they need to do anything, and where to go.

import type { AccessRequestRecord, Person } from './records.ts';

export interface EmailMessage {
  emailType: string;
  subject: string;
  html: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function paragraph(text: string): string {
  return `<p style="margin: 0 0 16px; font-size: 16px; line-height: 24px;">${text}</p>`;
}

function quote(label: string, text: string): string {
  return `<div style="border-left: 4px solid #2563eb; background: #eff6ff; padding: 12px 16px; margin: 0 0 16px;">
    <p style="margin: 0 0 4px; font-weight: 600; font-size: 14px;">${escapeHtml(label)}</p>
    <p style="margin: 0; font-size: 16px; line-height: 24px; white-space: pre-line;">${escapeHtml(text)}</p>
  </div>`;
}

function layout(heading: string, body: string, action?: { label: string; url: string }): string {
  const button = action
    ? `<p style="margin: 24px 0 0;"><a href="${escapeHtml(action.url)}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 12px 20px; border-radius: 6px; text-decoration: none; font-size: 16px;">${escapeHtml(action.label)}</a></p>`
    : '';
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color: #1f2937; background: #f3f4f6; margin: 0; padding: 24px 16px;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden;">
    <div style="background: #1f2937; padding: 20px 24px;">
      <p style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700;">myK9Show</p>
    </div>
    <div style="padding: 24px;">
      <h1 style="margin: 0 0 16px; font-size: 22px;">${escapeHtml(heading)}</h1>
      ${body}${button}
    </div>
    <div style="background: #f9fafb; padding: 16px 24px; border-top: 1px solid #e5e7eb;">
      <p style="margin: 0; color: #6b7280; font-size: 13px;">This email was sent by myK9Show because of an access request on your account.</p>
    </div>
  </div>
</body>
</html>`;
}

const REQUEST_LABEL = {
  new_club: 'club setup',
  secretary: 'secretary and show-manager access',
  membership: 'club membership',
} as const;

function hello(person: Person): string {
  return paragraph(`Hi ${escapeHtml(person.name)},`);
}

/** Confirmation to the person who asked a site admin to set up a new club. */
export function newClubReceivedEmail(record: AccessRequestRecord, siteUrl: string): EmailMessage {
  const club = escapeHtml(record.clubName);
  return {
    emailType: 'access_request_new_club_received',
    subject: `We received your club request: ${record.clubName}`,
    html: layout(
      'Your request is waiting for review',
      hello(record.requester) +
        paragraph(
          `Thank you. We received your request to set up <strong>${club}</strong> on myK9Show.`
        ) +
        paragraph(
          'A myK9Show administrator will review it. You do not need to do anything else right now. We will email you as soon as it has been reviewed.'
        ) +
        paragraph('Your account keeps working as usual while you wait.'),
      { label: 'Open myK9Show', url: siteUrl }
    ),
  };
}

/** Notice to a reviewer (site admin or club admin) that an ask is waiting. */
export function reviewerNoticeEmail(record: AccessRequestRecord, siteUrl: string): EmailMessage {
  const who = escapeHtml(record.requester.name);
  const email = record.requester.email ? ` (${escapeHtml(record.requester.email)})` : '';
  const club = escapeHtml(record.clubName);
  const label = REQUEST_LABEL[record.kind];
  const isNewClub = record.kind === 'new_club';
  const where = isNewClub ? 'Admin &rarr; Onboarding' : 'Club Members';
  const detail =
    record.kind === 'secretary'
      ? `${who}${email} asked <strong>${club}</strong> for secretary and show-manager access.`
      : record.kind === 'membership'
        ? `${who}${email} asked to join <strong>${club}</strong> as a member.`
        : `${who}${email} asked to set up a new club: <strong>${club}</strong>.`;
  return {
    emailType: `access_request_${record.kind}_submitted`,
    subject: isNewClub
      ? `New club request: ${record.clubName}`
      : `${record.requester.name} is waiting for ${label} at ${record.clubName}`,
    html: layout(
      'A request is waiting for your review',
      paragraph(detail) +
        (record.requesterNote ? quote('Their reason', record.requesterNote) : '') +
        paragraph(
          `You can approve or deny it in myK9Show under ${where}. Nothing changes until you do.`
        ),
      {
        label: 'Review the request',
        url: `${siteUrl}${isNewClub ? '/admin/onboarding' : '/club-admin/members'}`,
      }
    ),
  };
}

/** The decision, sent to the requester. */
export function decisionEmail(record: AccessRequestRecord, siteUrl: string): EmailMessage {
  const club = escapeHtml(record.clubName);
  const approved = record.status === 'approved';
  const emailType = `access_request_${record.kind}_${approved ? 'approved' : 'denied'}`;

  if (approved) {
    const copy = {
      new_club: {
        subject: `Your club is ready: ${record.clubName}`,
        body:
          paragraph(
            `Your request was approved. <strong>${club}</strong> is now set up in myK9Show.`
          ) +
          paragraph(
            'Club-admin access is now available on your account, so you can manage the club and set up its shows. Sign in to get started.'
          ),
      },
      secretary: {
        subject: `Show access approved at ${record.clubName}`,
        body:
          paragraph(`<strong>${club}</strong> approved your request.`) +
          paragraph(
            'Secretary and show-manager access is now available on your account, so you can set up and run this club&rsquo;s shows.'
          ),
      },
      membership: {
        subject: `Welcome to ${record.clubName}`,
        body:
          paragraph(
            `<strong>${club}</strong> approved your membership request. You are now on the club&rsquo;s member list.`
          ) +
          paragraph(
            'Membership does not include permission to set up or run shows. If you help run shows, ask the club for secretary access separately.'
          ),
      },
    }[record.kind];
    return {
      emailType,
      subject: copy.subject,
      html: layout('Your request was approved', hello(record.requester) + copy.body, {
        label: 'Open myK9Show',
        url: siteUrl,
      }),
    };
  }

  const reviewer = record.kind === 'new_club' ? 'The myK9Show team' : escapeHtml(record.clubName);
  const explanation = record.reviewerNote?.trim()
    ? quote('Their note', record.reviewerNote.trim())
    : paragraph(
        record.kind === 'new_club'
          ? 'We could not approve it as submitted. If you think this is a mistake, contact myK9Show support from the Help menu.'
          : 'The club did not include a reason. If you have questions, please contact the club directly.'
      );
  return {
    emailType,
    subject: `Update on your ${REQUEST_LABEL[record.kind]} request`,
    html: layout(
      'Your request was not approved',
      hello(record.requester) +
        paragraph(
          `${reviewer} reviewed your request for ${REQUEST_LABEL[record.kind]}${record.kind === 'new_club' ? ` for <strong>${club}</strong>` : ''} and did not approve it.`
        ) +
        explanation +
        paragraph('Nothing else on your account has changed.'),
      { label: 'Open myK9Show', url: siteUrl }
    ),
  };
}
