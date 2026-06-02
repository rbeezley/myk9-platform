import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_PUSH_SUBSCRIPTION_SELECT,
  accountPushSession,
  buildAccountPushTargets,
  buildGroupLabel,
  buildRingsidePushActionUrl,
  buildTargetedMessageActionUrl,
  CALLER_ROLE_SELECT,
  callerRoleAuthorizesShow,
  isPresenceSuppressed,
  mergePushTargetsBySubscriptionId,
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
      'push_subscriptions!inner(id, endpoint, p256dh, auth, user_id)'
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

  it('routes passcode push taps back to the matching at-show route when known', () => {
    expect(
      buildRingsidePushActionUrl('show-1', {
        lastSeenRoute: '/at-show/show-1/class/class-1',
      })
    ).toBe('/at-show/show-1/class/class-1');
  });

  it('falls passcode push taps back to the show class picker for missing or mismatched routes', () => {
    expect(buildRingsidePushActionUrl('show-1', { lastSeenRoute: null })).toBe('/at-show/show-1');
    expect(
      buildRingsidePushActionUrl('show-1', {
        lastSeenRoute: '/at-show/other-show/class/class-1',
      })
    ).toBe('/at-show/show-1');
  });

  it('routes account-keyed push taps to the exhibitor inbox thread, ignoring at-show presence', () => {
    expect(
      buildTargetedMessageActionUrl(
        'show-1',
        { user_id: 'account-1' },
        { lastSeenRoute: '/at-show/show-1/class/class-1' }
      )
    ).toBe('/messages/show-1');
  });

  it('keeps passcode-keyed push taps in /at-show because they have no inbox page', () => {
    expect(
      buildTargetedMessageActionUrl(
        'show-1',
        { user_id: null },
        { lastSeenRoute: '/at-show/show-1/class/class-1' }
      )
    ).toBe('/at-show/show-1/class/class-1');

    expect(
      buildTargetedMessageActionUrl('show-1', { user_id: null }, { lastSeenRoute: null })
    ).toBe('/at-show/show-1');

    expect(
      buildTargetedMessageActionUrl('show-1', { user_id: undefined }, { lastSeenRoute: null })
    ).toBe('/at-show/show-1');
  });

  it('selects the account push subscription columns including user_id', () => {
    expect(ACCOUNT_PUSH_SUBSCRIPTION_SELECT).toContain('user_id');
    expect(ACCOUNT_PUSH_SUBSCRIPTION_SELECT).toContain('endpoint');
    expect(ACCOUNT_PUSH_SUBSCRIPTION_SELECT).not.toContain('keys');
  });

  it('builds a non-suppressing exhibitor session for an account device', () => {
    const session = accountPushSession('acct-sub-1');
    expect(session).toEqual({
      subscriptionId: 'acct-sub-1',
      role: 'exhibitor',
      favoritedArmbands: [],
      lastSeenAt: null,
      lastSeenRoute: null,
    });
    // Null last-seen means presence suppression never applies to account devices.
    expect(isPresenceSuppressed(session)).toBe(false);
  });

  it('grafts live /at-show presence onto an account device targeted by entry, not favorite', () => {
    // An entered exhibitor is actively at /at-show but never favorited the messaged
    // dog, so they are absent from the favorite-matched ringside targets. Their own
    // device must still inherit that live presence so suppression applies — otherwise
    // they get buzzed while staring at the screen (the P1 regression).
    const presenceBySubscriptionId = new Map([
      ['acct-sub-1', { lastSeenAt: '2026-05-30T20:00:30.000Z', lastSeenRoute: '/at-show/show-1' }],
    ]);

    const targets = buildAccountPushTargets(
      [
        { id: 'acct-sub-1', user_id: 'owner-1' },
        { id: 'acct-sub-2', user_id: 'owner-2' },
      ],
      presenceBySubscriptionId
    );

    const present = targets.find(t => t.subscription.id === 'acct-sub-1');
    expect(present?.session.lastSeenAt).toBe('2026-05-30T20:00:30.000Z');
    expect(present?.session.lastSeenRoute).toBe('/at-show/show-1');
    expect(isPresenceSuppressed(present!.session, Date.parse('2026-05-30T20:01:00.000Z'))).toBe(
      true
    );

    // A device with no live ringside session keeps the non-suppressing fallback.
    const absent = targets.find(t => t.subscription.id === 'acct-sub-2');
    expect(absent?.session.lastSeenAt).toBeNull();
    expect(isPresenceSuppressed(absent!.session)).toBe(false);
  });

  it('merges push targets deduped by subscription id, ringside winning', () => {
    const ringside = [
      { session: accountPushSession('shared'), subscription: { id: 'shared', source: 'ringside' } },
      { session: accountPushSession('r-only'), subscription: { id: 'r-only', source: 'ringside' } },
    ];
    const account = [
      { session: accountPushSession('shared'), subscription: { id: 'shared', source: 'account' } },
      { session: accountPushSession('a-only'), subscription: { id: 'a-only', source: 'account' } },
    ];

    const merged = mergePushTargetsBySubscriptionId(ringside, account);

    expect(merged.map(t => t.subscription.id).sort()).toEqual(['a-only', 'r-only', 'shared']);
    // The shared subscription keeps the ringside entry (with its real presence).
    expect(merged.find(t => t.subscription.id === 'shared')?.subscription.source).toBe('ringside');
  });
});
