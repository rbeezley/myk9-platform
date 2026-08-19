import { describe, expect, it } from 'vitest';
import {
  buildShowEveNudgePayload,
  CLAIM_LEASE_MS,
  isJudgeAssignedToTrial,
  isTrialNudgeable,
  filterPushOptedIn,
  filterClubStaffByMembership,
  groupTrialsByShow,
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
    // Deep link so the tap itself primes the device. The service worker reads
    // `actionUrl` (swClickNavigation.readActionUrl) — a `url` field is ignored
    // and every tap would land on '/'.
    expect(payload.data.actionUrl).toBe('/at-show/show-1');
  });

  it('says CONTINUES for a later day of a multi-day show', () => {
    const payload = buildShowEveNudgePayload({
      showName: 'Autumn Classic',
      showId: 'show-1',
      trialDate: '2026-08-21',
      showStartDate: '2026-08-20',
    });

    expect(payload.title).toMatch(/continues tomorrow/i);
    expect(payload.title).not.toMatch(/starts tomorrow/i);
  });

  it('says STARTS on the first day, and when the start date is unknown', () => {
    expect(
      buildShowEveNudgePayload({
        showName: 'Autumn Classic',
        showId: 'show-1',
        trialDate: '2026-08-20',
        showStartDate: '2026-08-20',
      }).title
    ).toMatch(/starts tomorrow/i);

    expect(
      buildShowEveNudgePayload({
        showName: 'Autumn Classic',
        showId: 'show-1',
        trialDate: '2026-08-21',
      }).title
    ).toMatch(/starts tomorrow/i);
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
  it('includes a judge assigned directly to this trial', () => {
    expect(isJudgeAssignedToTrial({ trial_id: 'trial-1', class_id: null }, 'trial-1')).toBe(true);
  });

  it('excludes a judge assigned only to another day of the same show', () => {
    expect(isJudgeAssignedToTrial({ trial_id: 'trial-2', class_id: null }, 'trial-1')).toBe(false);
  });

  it('includes a true show-level assignment (no trial, no class)', () => {
    expect(isJudgeAssignedToTrial({ trial_id: null, class_id: null }, 'trial-1')).toBe(true);
  });

  it('uses the CLASS trial for a class-level assignment, which stores a null trial_id', () => {
    // replaceClassAssignment writes trialId: null with a class id, so a
    // class-level assignment must not read as show-wide on a multi-day show.
    expect(
      isJudgeAssignedToTrial(
        { trial_id: null, class_id: 'class-9', class_trial_id: 'trial-2' },
        'trial-1'
      )
    ).toBe(false);
    expect(
      isJudgeAssignedToTrial(
        { trial_id: null, class_id: 'class-9', class_trial_id: 'trial-1' },
        'trial-1'
      )
    ).toBe(true);
  });

  it('excludes an assignment whose class was soft-deleted', () => {
    expect(
      isJudgeAssignedToTrial(
        {
          trial_id: null,
          class_id: 'class-9',
          class_trial_id: 'trial-1',
          class_deleted_at: '2026-08-18T00:00:00Z',
        },
        'trial-1'
      )
    ).toBe(false);
  });

  it('includes a class assignment whose trial cannot be resolved', () => {
    // Missing embed is a data anomaly; a judge on this show getting one extra
    // reminder beats a judge who is working tomorrow getting none.
    expect(
      isJudgeAssignedToTrial({ trial_id: null, class_id: 'class-9' }, 'trial-1')
    ).toBe(true);
  });
});

describe('isTrialNudgeable', () => {
  const show = (over: Partial<{ status: string | null; deleted_at: string | null }> = {}) => ({
    show: { status: 'upcoming' as string | null, deleted_at: null as string | null, ...over },
  });

  it('accepts an ordinary upcoming trial', () => {
    expect(isTrialNudgeable(show())).toBe(true);
  });

  it('accepts a NULL show status — absent is not cancelled', () => {
    expect(isTrialNudgeable(show({ status: null }))).toBe(true);
  });

  it('rejects a cancelled show — nobody should be told it starts tomorrow', () => {
    expect(isTrialNudgeable(show({ status: 'cancelled' }))).toBe(false);
  });

  it('rejects a soft-deleted show', () => {
    expect(isTrialNudgeable(show({ deleted_at: '2026-08-18T00:00:00Z' }))).toBe(false);
  });

  it('rejects a trial whose show embed is missing', () => {
    expect(isTrialNudgeable({ show: null })).toBe(false);
  });
});

describe('selectShowEveRecipients — judges come only from assignments', () => {
  it('does not nudge a club judge who has no assignment for this show', () => {
    const recipients = selectShowEveRecipients({
      clubStaff: [
        { auth_user_id: 'judge-not-working', role_name: 'judge' },
        { auth_user_id: 'sec-1', role_name: 'secretary' },
      ],
      judges: [],
    });

    expect(recipients).toEqual(['sec-1']);
  });

  it('still nudges a club judge who IS assigned, via the assignment path', () => {
    const recipients = selectShowEveRecipients({
      clubStaff: [{ auth_user_id: 'judge-working', role_name: 'judge' }],
      judges: [{ auth_user_id: 'judge-working', status: 'confirmed' }],
    });

    expect(recipients).toEqual(['judge-working']);
  });
});

describe('filterPushOptedIn', () => {
  it('keeps a recipient who has no preferences row — push_enabled defaults to true', () => {
    expect(filterPushOptedIn(['a', 'b'], [])).toEqual(['a', 'b']);
  });

  it('drops a recipient who explicitly turned push off', () => {
    expect(
      filterPushOptedIn(['a', 'b'], [{ auth_user_id: 'b', push_enabled: false }])
    ).toEqual(['a']);
  });

  it('keeps a recipient whose push_enabled is null (unset, not disabled)', () => {
    expect(filterPushOptedIn(['a'], [{ auth_user_id: 'a', push_enabled: null }])).toEqual(['a']);
  });
});

describe('groupTrialsByShow', () => {
  it('collapses same-day trials of one show into a single nudge target', () => {
    const groups = groupTrialsByShow([
      { id: 't1', date: '2026-08-20', show_id: 's1', show: { name: 'Show One' } },
      { id: 't2', date: '2026-08-20', show_id: 's1', show: { name: 'Show One' } },
      { id: 't3', date: '2026-08-20', show_id: 's2', show: { name: 'Show Two' } },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].showId).toBe('s1');
    expect(groups[0].trialIds).toEqual(['t1', 't2']);
    expect(groups[1].trialIds).toEqual(['t3']);
  });
});

describe('filterClubStaffByMembership', () => {
  const activeMembers = new Set(['person-active']);

  it('drops a club-scoped secretary who is not an active club member', () => {
    const kept = filterClubStaffByMembership(
      [{ auth_user_id: 'a', user_id: 'person-inactive', role_name: 'secretary', show_id: null }],
      activeMembers
    );
    expect(kept).toEqual([]);
  });

  it('keeps a club-scoped secretary with active membership', () => {
    const kept = filterClubStaffByMembership(
      [{ auth_user_id: 'a', user_id: 'person-active', role_name: 'secretary', show_id: null }],
      activeMembers
    );
    expect(kept).toHaveLength(1);
  });

  it('keeps a SHOW-scoped official regardless of membership — explicitly exempt', () => {
    const kept = filterClubStaffByMembership(
      [{ auth_user_id: 'a', user_id: 'person-inactive', role_name: 'secretary', show_id: 'show-1' }],
      activeMembers
    );
    expect(kept).toHaveLength(1);
  });
});
