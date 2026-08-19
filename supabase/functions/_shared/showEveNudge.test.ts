import { describe, expect, it } from 'vitest';
import {
  buildShowEveNudgePayload,
  CLAIM_LEASE_MS,
  isJudgeAssignedToTrial,
  selectShowEveRecipients,
  shouldReclaimStaleClaim,
  type ShowEveClubStaffRow,
  type ShowEveJudgeRow,
} from './showEveNudge.ts';

const clubStaff = (authUserId: string, role: string): ShowEveClubStaffRow => ({
  auth_user_id: authUserId,
  role_name: role,
});

const judge = (authUserId: string | null, status = 'confirmed'): ShowEveJudgeRow => ({
  auth_user_id: authUserId,
  status,
});

describe('selectShowEveRecipients', () => {
  it('includes club staff who run the show day', () => {
    const recipients = selectShowEveRecipients({
      clubStaff: [
        clubStaff('user-secretary', 'secretary'),
        clubStaff('user-steward', 'steward'),
        clubStaff('user-chairman', 'chairman'),
        clubStaff('user-club-admin', 'club_admin'),
      ],
      judges: [],
    });

    expect(recipients.sort()).toEqual([
      'user-chairman',
      'user-club-admin',
      'user-secretary',
      'user-steward',
    ]);
  });

  it('excludes exhibitors and site admins — they do not run a ring', () => {
    const recipients = selectShowEveRecipients({
      clubStaff: [
        clubStaff('user-exhibitor', 'exhibitor'),
        clubStaff('user-site-admin', 'site_admin'),
      ],
      judges: [],
    });

    expect(recipients).toEqual([]);
  });

  it('includes assigned judges regardless of club role', () => {
    const recipients = selectShowEveRecipients({
      clubStaff: [],
      judges: [judge('user-judge')],
    });

    expect(recipients).toEqual(['user-judge']);
  });

  it('skips judges whose assignment is not active', () => {
    const recipients = selectShowEveRecipients({
      clubStaff: [],
      judges: [judge('user-judge', 'declined'), judge('user-judge-2', 'cancelled')],
    });

    expect(recipients).toEqual([]);
  });

  it('skips people with no auth account — there is nothing to notify', () => {
    const recipients = selectShowEveRecipients({
      clubStaff: [clubStaff('', 'secretary')],
      judges: [judge(null)],
    });

    expect(recipients).toEqual([]);
  });

  it('deduplicates someone who is both club staff and an assigned judge', () => {
    const recipients = selectShowEveRecipients({
      clubStaff: [clubStaff('user-both', 'secretary')],
      judges: [judge('user-both')],
    });

    expect(recipients).toEqual(['user-both']);
  });
});

describe('buildShowEveNudgePayload', () => {
  it('names the show and tells the operator what to do', () => {
    const payload = buildShowEveNudgePayload({
      showName: 'Cedar Falls Scent Work',
      showId: 'show-1',
      trialDate: '2026-08-20',
    });

    expect(payload.title).toContain('Cedar Falls Scent Work');
    expect(payload.body).toMatch(/open the show/i);
    expect(payload.body).toMatch(/without internet/i);
    // Deep link so the tap itself primes the device.
    expect(payload.data.url).toBe('/at-show/show-1');
  });

  it('carries a per-show notification tag so two shows do not collapse', () => {
    const first = buildShowEveNudgePayload({
      showName: 'Show One',
      showId: 'show-1',
      trialDate: '2026-08-20',
    });
    const second = buildShowEveNudgePayload({
      showName: 'Show Two',
      showId: 'show-2',
      trialDate: '2026-08-20',
    });

    // sw-custom.ts derives the notification tag from payload.type when there
    // is no announcementId/messageId; a shared tag would replace the earlier
    // nudge instead of showing both.
    expect(first.type).toBe('show-eve:show-1');
    expect(second.type).toBe('show-eve:show-2');
    expect(first.type).not.toBe(second.type);
  });

  it('says "tomorrow" rather than printing a raw date', () => {
    const payload = buildShowEveNudgePayload({
      showName: 'Spring Trial',
      showId: 'show-2',
      trialDate: '2026-08-20',
    });

    expect(payload.body).toMatch(/tomorrow/i);
    expect(payload.body).not.toContain('2026-08-20');
  });
});

describe('shouldReclaimStaleClaim', () => {
  const now = Date.parse('2026-08-19T23:10:00Z');

  it('does not reclaim a delivered nudge — that would double-buzz someone', () => {
    expect(
      shouldReclaimStaleClaim(
        { claimed_at: '2026-08-19T23:00:00Z', delivered_at: '2026-08-19T23:00:05Z' },
        now
      )
    ).toBe(false);
  });

  it('does not reclaim a fresh undelivered claim — another run may be mid-send', () => {
    expect(
      shouldReclaimStaleClaim({ claimed_at: '2026-08-19T23:09:30Z', delivered_at: null }, now)
    ).toBe(false);
  });

  it('reclaims an undelivered claim older than the lease — a crashed run left it', () => {
    const stale = new Date(now - CLAIM_LEASE_MS - 1000).toISOString();
    expect(shouldReclaimStaleClaim({ claimed_at: stale, delivered_at: null }, now)).toBe(true);
  });

  it('reclaims when the claim timestamp is unreadable rather than suppressing forever', () => {
    expect(shouldReclaimStaleClaim({ claimed_at: 'not-a-date', delivered_at: null }, now)).toBe(
      true
    );
  });
});

describe('isJudgeAssignedToTrial', () => {
  it('includes a judge assigned to this trial', () => {
    expect(isJudgeAssignedToTrial({ trial_id: 'trial-1' }, 'trial-1')).toBe(true);
  });

  it('excludes a judge assigned only to another day of the same show', () => {
    expect(isJudgeAssignedToTrial({ trial_id: 'trial-2' }, 'trial-1')).toBe(false);
  });

  it('includes a show-level assignment, which covers every day', () => {
    expect(isJudgeAssignedToTrial({ trial_id: null }, 'trial-1')).toBe(true);
  });
});
