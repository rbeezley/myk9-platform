import { describe, expect, it } from 'vitest';
import {
  buildShowEveNudgePayload,
  selectShowEveRecipients,
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
