import { describe, expect, it, vi } from 'vitest';
import { buildClubPageActions, type ClubPageActionInput } from '../clubPageActions';

function input(overrides: Partial<ClubPageActionInput> = {}): ClubPageActionInput {
  return {
    canAddShow: false,
    canEditBranding: false,
    canAuthorizeClub: false,
    isClubAuthorized: false,
    isAuthorizationLoading: false,
    isAuthorizationUpdating: false,
    onEditPhoto: vi.fn(),
    onAddShow: vi.fn(),
    onAuthorize: vi.fn(),
    onRequestRevoke: vi.fn(),
    ...overrides,
  };
}

const labels = (overrides: Partial<ClubPageActionInput>) =>
  buildClubPageActions(input(overrides)).map(action => action.label);

describe('buildClubPageActions (CRUD standard decision 6)', () => {
  it('offers Change Photo only to a viewer who may edit the branding', () => {
    expect(labels({ canEditBranding: true })).toEqual(['Change Photo']);
    expect(labels({ canEditBranding: false })).toEqual([]);
  });

  it('offers a site admin Authorize Club on an unauthorized club, and it authorizes', () => {
    const onAuthorize = vi.fn();
    const actions = buildClubPageActions(
      input({ canAuthorizeClub: true, isClubAuthorized: false, onAuthorize })
    );
    expect(actions.map(action => action.label)).toEqual(['Authorize Club']);
    actions[0]?.run();
    expect(onAuthorize).toHaveBeenCalledTimes(1);
  });

  it('offers Revoke Authorization on an authorized club, opening the confirm, never revoking', () => {
    const onRequestRevoke = vi.fn();
    const actions = buildClubPageActions(
      input({ canAuthorizeClub: true, isClubAuthorized: true, onRequestRevoke })
    );
    expect(actions.map(action => action.label)).toEqual(['Revoke Authorization']);
    actions[0]?.run();
    expect(onRequestRevoke).toHaveBeenCalledTimes(1);
  });

  it('offers neither to a viewer who is not a site admin', () => {
    expect(labels({ canAuthorizeClub: false, isClubAuthorized: false })).toEqual([]);
    expect(labels({ canAuthorizeClub: false, isClubAuthorized: true })).toEqual([]);
  });

  it('offers neither while the authorization read is in flight, so it never shows the wrong one', () => {
    expect(
      labels({ canAuthorizeClub: true, isClubAuthorized: undefined, isAuthorizationLoading: true })
    ).toEqual([]);
  });

  it('greys the item with a reason while a change saves', () => {
    const [item] = buildClubPageActions(
      input({ canAuthorizeClub: true, isClubAuthorized: false, isAuthorizationUpdating: true })
    );
    expect(item?.disabledReason).toBe('Saving…');
  });

  it('offers Add Show for this club to a viewer who may create its shows, and it opens the wizard', () => {
    const onAddShow = vi.fn();
    const actions = buildClubPageActions(input({ canAddShow: true, onAddShow }));
    expect(actions.map(action => action.label)).toEqual(['Add Show for this club']);
    actions[0]?.run();
    expect(onAddShow).toHaveBeenCalledTimes(1);
    expect(labels({ canAddShow: false })).toEqual([]);
  });

  it('orders Add Show, then the photo, then the authorization item', () => {
    expect(labels({ canAddShow: true, canEditBranding: true, canAuthorizeClub: true })).toEqual([
      'Add Show for this club',
      'Change Photo',
      'Authorize Club',
    ]);
  });

  it('offers no contact items: About shows email, phone and website as links', () => {
    const all = labels({ canEditBranding: true, canAuthorizeClub: true });
    for (const label of all) expect(label).not.toMatch(/email|call|website/i);
  });
});
