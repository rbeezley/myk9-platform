// Plain, large-type email copy for access-request notifications. Written for
// people who may not revisit the site on their own: every message says what
// happened, whether they need to do anything, and where to go.

import { reviewerAudience, type AccessRequestRecord, type Person } from './records.ts';

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

function layout(heading: string, body: string, action: { label: string; url: string }): string {
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
      ${body}
      <p style="margin: 24px 0 0;"><a href="${escapeHtml(action.url)}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 12px 20px; border-radius: 6px; text-decoration: none; font-size: 16px;">${escapeHtml(action.label)}</a></p>
    </div>
    <div style="background: #f9fafb; padding: 16px 24px; border-top: 1px solid #e5e7eb;">
      <p style="margin: 0; color: #6b7280; font-size: 13px;">This email was sent by myK9Show because of an access request on your account.</p>
    </div>
  </div>
</body>
</html>`;
}

/** What was asked for, in words a requester would use. */
function askedFor(record: AccessRequestRecord): string {
  if (record.kind === 'new_club') return 'club setup';
  if (record.kind === 'membership') return 'club membership';
  return record.requestedRole === 'club_admin'
    ? 'club-admin access'
    : 'secretary and show-manager access';
}

/** "at <b>Club</b>" when the request names a club, else nothing. */
function atClub(record: AccessRequestRecord): string {
  return record.clubName ? ` at <strong>${escapeHtml(record.clubName)}</strong>` : '';
}

/** True when the club's own admins decide this request. */
function byClub(record: AccessRequestRecord): boolean {
  return reviewerAudience(record).role === 'club_admin';
}

function hello(person: Person): string {
  return paragraph(`Hi ${escapeHtml(person.name)},`);
}

function openSite(siteUrl: string) {
  return { label: 'Open myK9Show', url: siteUrl };
}

/** Confirmation to the person who made the request. */
export function requesterReceivedEmail(record: AccessRequestRecord, siteUrl: string): EmailMessage {
  const isNewClub = record.kind === 'new_club';
  const what = isNewClub
    ? `your request to set up <strong>${escapeHtml(record.clubName)}</strong> on myK9Show`
    : `your request for ${askedFor(record)}${atClub(record)}`;
  const reviewer = byClub(record) ? 'The club&rsquo;s admins' : 'A myK9Show administrator';
  return {
    emailType: `access_request_${record.kind}_received`,
    subject: isNewClub
      ? `We received your club request: ${record.clubName}`
      : `We received your request for ${askedFor(record)}`,
    html: layout(
      'Your request is waiting for review',
      hello(record.requester) +
        paragraph(`Thank you. We received ${what}.`) +
        paragraph(
          `${reviewer} will review it. You do not need to do anything else right now. We will email you as soon as it has been reviewed.`
        ) +
        paragraph('Your account keeps working as usual while you wait.'),
      openSite(siteUrl)
    ),
  };
}

function reviewPlace(record: AccessRequestRecord, siteUrl: string) {
  if (record.kind === 'new_club') {
    return { where: 'Admin &rarr; Onboarding', url: `${siteUrl}/admin/onboarding` };
  }
  if (!byClub(record)) {
    return { where: 'Admin &rarr; Role Requests', url: `${siteUrl}/admin/role-requests` };
  }
  return { where: 'your club&rsquo;s Members page', url: `${siteUrl}/club-admin/members` };
}

/** Notice to a reviewer (site admin or club admin) that a request is waiting. */
export function reviewerNoticeEmail(record: AccessRequestRecord, siteUrl: string): EmailMessage {
  const who = escapeHtml(record.requester.name);
  const email = record.requester.email ? ` (${escapeHtml(record.requester.email)})` : '';
  const club = escapeHtml(record.clubName);
  const detail =
    record.kind === 'new_club'
      ? `${who}${email} asked to set up a new club: <strong>${club}</strong>.`
      : record.kind === 'membership'
        ? `${who}${email} asked to join <strong>${club}</strong> as a member.`
        : `${who}${email} asked for ${askedFor(record)}${atClub(record)}.`;
  const place = reviewPlace(record, siteUrl);
  return {
    emailType: `access_request_${record.kind}_submitted`,
    subject:
      record.kind === 'new_club'
        ? `New club request: ${record.clubName}`
        : `${record.requester.name} is waiting for ${askedFor(record)}${record.clubName ? ` at ${record.clubName}` : ''}`,
    html: layout(
      'A request is waiting for your review',
      paragraph(detail) +
        (record.requesterNote?.trim() ? quote('Their reason', record.requesterNote.trim()) : '') +
        paragraph(
          `You can approve or deny it in myK9Show under ${place.where}. Nothing changes until you do.`
        ),
      { label: 'Review the request', url: place.url }
    ),
  };
}

function approvedCopy(record: AccessRequestRecord): { subject: string; body: string } {
  const club = escapeHtml(record.clubName);
  if (record.kind === 'new_club') {
    return {
      subject: `Your club is ready: ${record.clubName}`,
      body:
        paragraph(
          `Your request was approved. <strong>${club}</strong> is now set up in myK9Show.`
        ) +
        paragraph(
          'Club-admin access is now available on your account, so you can manage the club and set up its shows. Sign in to get started.'
        ),
    };
  }
  if (record.kind === 'membership') {
    return {
      subject: `Welcome to ${record.clubName}`,
      body:
        paragraph(
          `<strong>${club}</strong> approved your membership request. You are now on the club&rsquo;s member list.`
        ) +
        paragraph(
          'Membership does not include permission to set up or run shows. If you help run shows, ask the club for secretary access separately.'
        ),
    };
  }
  if (record.requestedRole === 'club_admin') {
    return {
      subject: 'Club-admin access approved',
      body:
        paragraph(`Your request for club-admin access${atClub(record)} was approved.`) +
        paragraph('Club-admin access is now available on your account. Sign in to get started.'),
    };
  }
  return {
    subject: `Show access approved${record.clubName ? ` at ${record.clubName}` : ''}`,
    body:
      paragraph(
        `Your request for secretary and show-manager access${atClub(record)} was approved.`
      ) +
      paragraph(
        'Secretary and show-manager access is now available on your account, so you can set up and run the club&rsquo;s shows.'
      ),
  };
}

/** The decision, sent to the requester. The reviewer's note is included when one exists. */
export function decisionEmail(
  record: AccessRequestRecord,
  decision: 'approved' | 'denied',
  siteUrl: string
): EmailMessage {
  const note = record.reviewerNote?.trim() || null;
  const emailType = `access_request_${record.kind}_${decision}`;

  if (decision === 'approved') {
    const copy = approvedCopy(record);
    return {
      emailType,
      subject: copy.subject,
      html: layout(
        'Your request was approved',
        hello(record.requester) + copy.body + (note ? quote('Their note', note) : ''),
        openSite(siteUrl)
      ),
    };
  }

  const clubReviewed = byClub(record);
  const reviewer = clubReviewed ? escapeHtml(record.clubName) : 'The myK9Show team';
  const target =
    record.kind === 'new_club'
      ? ` for <strong>${escapeHtml(record.clubName)}</strong>`
      : clubReviewed
        ? ''
        : atClub(record);
  const explanation = note
    ? quote('Their note', note)
    : paragraph(
        clubReviewed
          ? 'The club did not include a reason. If you have questions, please contact the club directly.'
          : 'We could not approve it as submitted. If you think this is a mistake, contact myK9Show support from the Help menu.'
      );
  return {
    emailType,
    subject: `Update on your ${askedFor(record)} request`,
    html: layout(
      'Your request was not approved',
      hello(record.requester) +
        paragraph(
          `${reviewer} reviewed your request for ${askedFor(record)}${target} and did not approve it.`
        ) +
        explanation +
        paragraph('Nothing else on your account has changed.'),
      openSite(siteUrl)
    ),
  };
}
