// @vitest-environment node
import { describe, expect, it } from 'vitest';

import type { AccessRequestRecord } from './records.ts';
import {
  decisionEmail,
  escapeHtml,
  requesterReceivedEmail,
  reviewerNoticeEmail,
} from './templates.ts';

const SITE = 'https://myk9show.test';

function record(overrides: Partial<AccessRequestRecord> = {}): AccessRequestRecord {
  return {
    kind: 'new_club',
    id: '11111111-1111-4111-8111-111111111111',
    status: 'pending',
    requester: { name: 'Rita Tester', email: 'rita@example.test' },
    clubId: null,
    clubName: 'Heartland Dog Club',
    requestedRole: null,
    requesterNote: null,
    reviewerNote: null,
    ...overrides,
  };
}

describe('requesterReceivedEmail', () => {
  it('names the club and says the request is waiting for review', () => {
    const email = requesterReceivedEmail(record(), SITE);

    expect(email.emailType).toBe('access_request_new_club_received');
    expect(email.subject).toContain('Heartland Dog Club');
    expect(email.html).toContain('waiting for review');
    expect(email.html).toContain('Heartland Dog Club');
  });

  it('describes the thing asked for on club requests', () => {
    expect(
      requesterReceivedEmail(record({ kind: 'role', requestedRole: 'secretary' }), SITE).html
    ).toContain('secretary and show-manager access');
    expect(requesterReceivedEmail(record({ kind: 'membership' }), SITE).html).toContain(
      'club membership'
    );
  });
});

describe('reviewerNoticeEmail', () => {
  it('gives a site admin the requester name, email and club, and links to Onboarding', () => {
    const email = reviewerNoticeEmail(
      record({ requesterNote: 'We run four trials a year.' }),
      SITE
    );

    expect(email.emailType).toBe('access_request_new_club_submitted');
    expect(email.html).toContain('Rita Tester');
    expect(email.html).toContain('rita@example.test');
    expect(email.html).toContain('Heartland Dog Club');
    expect(email.html).toContain('We run four trials a year.');
    expect(email.html).toContain(`${SITE}/admin/onboarding`);
  });

  it('sends a club admin to the club Members page with the reason', () => {
    const email = reviewerNoticeEmail(
      record({
        kind: 'role',
        requestedRole: 'secretary',
        clubId: 'club-1',
        requesterNote: 'I run entries.',
      }),
      SITE
    );

    expect(email.emailType).toBe('access_request_role_submitted');
    expect(email.html).toContain('secretary and show-manager access');
    expect(email.html).toContain('I run entries.');
    expect(email.html).toContain(`${SITE}/club-admin/members`);
  });

  it('sends a site admin to Role Requests for a role request with no club', () => {
    const email = reviewerNoticeEmail(
      record({ kind: 'role', requestedRole: 'club_admin', clubId: null, clubName: '' }),
      SITE
    );

    expect(email.html).toContain(`${SITE}/admin/role-requests`);
    expect(email.html).toContain('club-admin access');
  });

  it('escapes everything a requester typed', () => {
    const email = reviewerNoticeEmail(
      record({
        requester: { name: '<script>x</script>', email: 'rita@example.test' },
        clubName: 'A & B <Club>',
        requesterNote: '"quoted" <b>bold</b>',
      }),
      SITE
    );

    expect(email.html).not.toContain('<script>');
    expect(email.html).not.toContain('<b>bold</b>');
    expect(email.html).toContain('A &amp; B &lt;Club&gt;');
  });
});

describe('decisionEmail', () => {
  it('tells a new-club requester that club-admin access is available', () => {
    const email = decisionEmail(record({ status: 'approved' }), 'approved', SITE);

    expect(email.emailType).toBe('access_request_new_club_approved');
    expect(email.html).toContain('Club-admin access is now available');
    expect(email.html).toContain('Heartland Dog Club');
  });

  it('tells a secretary requester that show-manager access is available', () => {
    const email = decisionEmail(
      record({ kind: 'role', requestedRole: 'secretary', status: 'approved', clubId: 'club-1' }),
      'approved',
      SITE
    );

    expect(email.emailType).toBe('access_request_role_approved');
    expect(email.html).toContain('Secretary and show-manager access is now available');
  });

  it('includes the reviewer note on a denial when one was entered', () => {
    const email = decisionEmail(
      record({ status: 'denied', reviewerNote: 'This club is already on myK9Show.' }),
      'denied',
      SITE
    );

    expect(email.emailType).toBe('access_request_new_club_denied');
    expect(email.html).toContain('This club is already on myK9Show.');
  });

  it('uses a clear generic explanation on a denial without a note', () => {
    const newClub = decisionEmail(record({ status: 'denied' }), 'denied', SITE);
    const club = decisionEmail(
      record({ kind: 'membership', clubId: 'club-1', status: 'denied', reviewerNote: '  ' }),
      'denied',
      SITE
    );

    expect(newClub.html).toContain('contact myK9Show support');
    expect(club.html).toContain('did not include a reason');
  });

  it('includes a note on an approval too', () => {
    const email = decisionEmail(
      record({
        kind: 'membership',
        clubId: 'club-1',
        status: 'approved',
        reviewerNote: 'Welcome!',
      }),
      'approved',
      SITE
    );

    expect(email.html).toContain('Welcome!');
    expect(email.html).toContain('does not include permission to set up or run shows');
  });
});

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#039;&amp;&#039;&lt;/a&gt;'
    );
  });
});
