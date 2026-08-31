/**
 * The row-action menu must render in a PORTAL, not inline under the trigger.
 *
 * Measured on staging at 1280x600 before this was fixed: the bottom row's
 * trigger sat at y=532 with 24px of space below it, and the popup — pinned by
 * `absolute right-0 top-full` — rendered at y=580 with a height of 573px. That
 * put 553px of it below the fold, including "Grant Show Access" and "Remove
 * Member", with no way to reach them. Wheeling over the visible sliver scrolled
 * the table container instead of the menu.
 *
 * jsdom cannot lay out or resolve CSS, so a test asserting max-height or
 * overflow would pass against the broken markup. What it CAN prove is where the
 * popup lives in the tree: inline under the trigger (clipped, unpositionable)
 * versus portaled to the body (free to flip and bound itself). That structural
 * difference is the fix, so that is what this asserts.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { MemberActionMenu } from './ClubMemberDialogs';
import type { ClubMember } from '@/types/club-membership-types';

const baseMember: ClubMember = {
  id: 'm1',
  clubId: 'c1',
  personId: 'p1',
  personName: 'Ada Lovelace',
  personEmail: 'ada@example.com',
  membershipType: 'full',
  membershipStatus: 'active',
  joinedDate: '2024-01-15',
} as ClubMember;

const noop = () => {};

function renderMenu(overrides: Partial<React.ComponentProps<typeof MemberActionMenu>> = {}) {
  return render(
    <MemberActionMenu
      member={baseMember}
      hasShowAccess={false}
      onChangeType={noop}
      onChangeStatus={noop}
      onRemove={noop}
      onToggleShowAccess={noop}
      {...overrides}
    />
  );
}

const getTrigger = () => screen.getByRole('button', { name: /actions for ada lovelace/i });

const openMenu = async (user: ReturnType<typeof renderMenu>['user']) => {
  await user.click(getTrigger());
};

describe('MemberActionMenu', () => {
  it('renders the popup outside the trigger subtree', async () => {
    const { user, container } = renderMenu();
    await openMenu(user);

    const menu = await screen.findByRole('menu');
    // The whole point: if the popup is a descendant of the rendered row, it is
    // pinned to the trigger and cannot escape the fold.
    expect(container.contains(menu)).toBe(false);
    expect(document.body.contains(menu)).toBe(true);
  });

  it('exposes the actions as a real ARIA menu', async () => {
    const { user } = renderMenu();
    await openMenu(user);

    await screen.findByRole('menu');
    // Every action is reachable by the roving-focus keyboard contract that the
    // hand-rolled version never implemented.
    expect(screen.getByRole('menuitem', { name: /grant show access/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /remove member/i })).toBeInTheDocument();
  });

  it('keeps every action row at the 44px touch-target floor', async () => {
    const { user } = renderMenu();
    await openMenu(user);

    await screen.findByRole('menu');
    expect(screen.getByRole('menuitem', { name: /remove member/i })).toHaveClass('min-h-11');
    expect(screen.getByRole('menuitem', { name: /grant show access/i })).toHaveClass('min-h-11');
  });

  it('fires the action the operator picked', async () => {
    const granted: Array<[string, boolean]> = [];
    const { user } = renderMenu({
      onToggleShowAccess: (personId, grant) => granted.push([personId, grant]),
    });
    await openMenu(user);

    await user.click(await screen.findByRole('menuitem', { name: /grant show access/i }));
    expect(granted).toEqual([['p1', true]]);
  });

  it('disables the membership type the member already holds', async () => {
    const { user } = renderMenu();
    await openMenu(user);

    await screen.findByRole('menu');
    expect(screen.getByRole('menuitem', { name: /full member/i })).toHaveAttribute('data-disabled');
  });

  it('lets a club appoint a member whose membership is not active', async () => {
    // Inverted deliberately. This asserted the opposite until appointment became the
    // only grant: membership no longer gates show access in the database, so gating it
    // here would enforce the retired rule in the client alone — the shape where a fix
    // ships and is unreachable.
    const granted: Array<[string, boolean]> = [];
    const { user } = renderMenu({
      member: { ...baseMember, membershipStatus: 'lapsed' },
      onToggleShowAccess: (personId, grant) => granted.push([personId, grant]),
    });
    await openMenu(user);

    await screen.findByRole('menu');
    const item = screen.getByRole('menuitem', { name: /grant show access/i });
    expect(item).not.toHaveAttribute('data-disabled');
    // The label carried the rule too, so a disabled-only assertion would pass on a
    // menu that still tells the admin members-only.
    expect(item).toHaveTextContent(/^Grant Show Access$/);

    await user.click(item);
    expect(granted).toEqual([['p1', true]]);
  });

  it('still offers revoke for an appointed member whose membership lapsed', async () => {
    // The pairing that makes the change safe: appointment survives a lapse, so the
    // club must retain a way to end it.
    const { user } = renderMenu({
      member: { ...baseMember, membershipStatus: 'lapsed' },
      hasShowAccess: true,
    });
    await openMenu(user);

    await screen.findByRole('menu');
    expect(screen.getByRole('menuitem', { name: /revoke show access/i })).not.toHaveAttribute(
      'data-disabled'
    );
  });
});
