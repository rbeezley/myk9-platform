import { describe, expect, it } from 'vitest';
import {
  buildGroupLabel,
  CALLER_ROLE_SELECT,
  callerRoleAuthorizesShow,
  isPresenceSuppressed,
  RINGSIDE_SESSION_PUSH_TARGET_SELECT,
  ringsideSessionMatchesTarget,
  targetArmbands,
  uniqueAccountRecipients,
} from './targeting';

describe('send-targeted-message targeting helpers', () => {
  it('dedupes account recipients and removes the sender', () => {
    expect(
      uniqueAccountRecipients(
        [
          { armband: '101', authUserIds: ['owner-1', 'sender', null] },
          { armband: '102', authUserIds: ['owner-1', 'handler-1'] },
        ],
        'sender'
      )
    ).toEqual(['owner-1', 'handler-1']);
  });

  it('extracts unique armbands for passcode favorite matching', () => {
    expect(
      targetArmbands([
        { armband: '101', authUserIds: [] },
        { armband: '101', authUserIds: [] },
        { armband: ' 202 ', authUserIds: [] },
        { armband: null, authUserIds: [] },
      ])
    ).toEqual(['101', '202']);
  });

  it('selects push subscription key columns that exist in the unified schema', () => {
    expect(RINGSIDE_SESSION_PUSH_TARGET_SELECT).toContain(
      'push_subscriptions!inner(id, endpoint, p256dh, auth)'
    );
    expect(RINGSIDE_SESSION_PUSH_TARGET_SELECT).not.toContain('keys');
  });

  it('authorizes callers through the denormalized user_roles auth_user_id column', () => {
    expect(CALLER_ROLE_SELECT).toContain('auth_user_id');
    expect(CALLER_ROLE_SELECT).not.toContain('people!inner');
  });

  it('authorizes site admins and scoped secretary roles for a show', () => {
    const show = { id: 'show-1', club_id: 'club-1' };

    expect(callerRoleAuthorizesShow({ club_id: null, roles: { name: 'site_admin' } }, show)).toBe(
      true
    );
    expect(
      callerRoleAuthorizesShow({ club_id: null, roles: { name: 'platform_admin' } }, show)
    ).toBe(true);
    expect(
      callerRoleAuthorizesShow({ club_id: 'club-1', roles: { name: 'secretary' } }, show)
    ).toBe(true);
    expect(
      callerRoleAuthorizesShow({ club_id: 'club-1', roles: { name: 'trial_secretary' } }, show)
    ).toBe(true);
    expect(
      callerRoleAuthorizesShow(
        { club_id: 'club-2', show_id: 'show-1', roles: { name: 'secretary' } },
        show
      )
    ).toBe(true);
    expect(
      callerRoleAuthorizesShow({ club_id: 'club-2', roles: { name: 'secretary' } }, show)
    ).toBe(false);
  });

  it('matches passcode-only exhibitors by favorited armband for class-style targets', () => {
    expect(
      ringsideSessionMatchesTarget(
        {
          subscriptionId: 'sub-1',
          role: 'exhibitor',
          favoritedArmbands: ['101'],
          lastSeenAt: null,
          lastSeenRoute: null,
        },
        'class',
        ['101', '102']
      )
    ).toBe(true);
  });

  it('matches checked-in passcode sessions by favorited armband', () => {
    const session = {
      subscriptionId: 'sub-1',
      role: 'exhibitor' as const,
      favoritedArmbands: ['202'],
      lastSeenAt: '2026-05-30T20:00:30.000Z',
      lastSeenRoute: '/at-show/show-1/class/class-1',
    };

    expect(ringsideSessionMatchesTarget(session, 'checked_in', ['101', '202'])).toBe(true);
    expect(ringsideSessionMatchesTarget(session, 'checked_in', ['101'])).toBe(false);
  });

  it('suppresses push while the ringside tab is freshly present', () => {
    expect(
      isPresenceSuppressed(
        {
          lastSeenAt: '2026-05-30T20:00:30.000Z',
          lastSeenRoute: '/at-show/show-1/class/class-1',
        },
        Date.parse('2026-05-30T20:01:00.000Z')
      )
    ).toBe(true);
  });

  it('labels checked-in and all-show sends clearly', () => {
    expect(buildGroupLabel({ targetType: 'checked_in' })).toBe('Sent to everyone checked in');
    expect(buildGroupLabel({ targetType: 'all_show' })).toBe('Sent to everyone in the show');
  });
});
