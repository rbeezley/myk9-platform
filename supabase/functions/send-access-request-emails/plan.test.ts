// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { idempotencyKey, planDeliveries, remainingDeliveries } from './plan.ts';
import { reviewerAudience, type AccessRequestRecord } from './records.ts';

const SITE = 'https://myk9show.test';

function record(overrides: Partial<AccessRequestRecord> = {}): AccessRequestRecord {
  return {
    kind: 'membership',
    id: '11111111-1111-4111-8111-111111111111',
    status: 'pending',
    requester: { name: 'Rita Tester', email: 'rita@example.test' },
    clubId: 'club-1',
    clubName: 'Heartland Dog Club',
    requestedRole: null,
    requesterNote: 'Long-time exhibitor.',
    reviewerNote: null,
    ...overrides,
  };
}

const carl = { name: 'Carl Admin', email: 'carl@example.test' };
const olga = { name: 'Olga Admin', email: 'OLGA@example.test' };

describe('reviewerAudience', () => {
  it('sends new-club requests to site admins', () => {
    expect(reviewerAudience(record({ kind: 'new_club', clubId: null }))).toEqual({
      role: 'site_admin',
    });
  });

  it('sends membership requests to the club admins of that club', () => {
    expect(reviewerAudience(record())).toEqual({ role: 'club_admin', clubId: 'club-1' });
  });

  it('sends a club-routed secretary request to that club admins', () => {
    expect(
      reviewerAudience(record({ kind: 'role', requestedRole: 'secretary', clubId: 'club-1' }))
    ).toEqual({ role: 'club_admin', clubId: 'club-1' });
  });

  it('sends a signup role request (no club) and a club-admin ask to site admins', () => {
    expect(
      reviewerAudience(record({ kind: 'role', requestedRole: 'secretary', clubId: null }))
    ).toEqual({ role: 'site_admin' });
    expect(
      reviewerAudience(record({ kind: 'role', requestedRole: 'club_admin', clubId: 'club-1' }))
    ).toEqual({ role: 'site_admin' });
  });
});

describe('planDeliveries', () => {
  it('confirms a submission to the requester and notifies every reviewer', () => {
    const plan = planDeliveries(record(), 'submitted', [carl, olga], SITE);

    expect(plan.map(d => [d.to, d.message.emailType])).toEqual([
      ['rita@example.test', 'access_request_membership_received'],
      ['carl@example.test', 'access_request_membership_submitted'],
      ['olga@example.test', 'access_request_membership_submitted'],
    ]);
  });

  it('sends nothing for a submission reviewed before the job ran', () => {
    // A "waiting for review" confirmation would contradict the decision email.
    for (const status of ['approved', 'denied'] as const) {
      expect(planDeliveries(record({ status }), 'submitted', [carl], SITE)).toEqual([]);
    }
  });

  it('sends only the requester the decision', () => {
    const plan = planDeliveries(
      record({ status: 'denied', reviewerNote: 'Join at the meeting.' }),
      'denied',
      [carl],
      SITE
    );

    expect(plan).toHaveLength(1);
    expect(plan[0].to).toBe('rita@example.test');
    expect(plan[0].message.emailType).toBe('access_request_membership_denied');
    expect(plan[0].message.html).toContain('Join at the meeting.');
  });

  it('drops recipients without an address and never emails one address twice', () => {
    const plan = planDeliveries(
      record(),
      'submitted',
      [{ name: 'No Email', email: null }, carl, { name: 'Carl again', email: 'CARL@example.test' }],
      SITE
    );

    expect(plan.map(d => d.to)).toEqual(['rita@example.test', 'carl@example.test']);
  });

  it('plans nothing for a requester without an address on a decision', () => {
    const plan = planDeliveries(
      record({ status: 'approved', requester: { name: 'there', email: null } }),
      'approved',
      [],
      SITE
    );

    expect(plan).toEqual([]);
  });
});

describe('remainingDeliveries', () => {
  it('skips addresses a previous attempt already reached, case-insensitively', () => {
    const plan = planDeliveries(record(), 'submitted', [carl, olga], SITE);

    expect(
      remainingDeliveries(plan, ['RITA@example.test', 'olga@example.test']).map(d => d.to)
    ).toEqual(['carl@example.test']);
  });
});

describe('idempotencyKey', () => {
  it('is stable per job and recipient, and differs across recipients and jobs', () => {
    expect(idempotencyKey('job-1', 'Rita@Example.test')).toBe(
      idempotencyKey('job-1', 'rita@example.test')
    );
    expect(idempotencyKey('job-1', 'rita@example.test')).not.toBe(
      idempotencyKey('job-1', 'carl@example.test')
    );
    expect(idempotencyKey('job-1', 'rita@example.test')).not.toBe(
      idempotencyKey('job-2', 'rita@example.test')
    );
  });
});
