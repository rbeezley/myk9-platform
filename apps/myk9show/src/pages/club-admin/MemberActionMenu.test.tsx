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

function renderMenu() {
  return render(
    <MemberActionMenu
      member={baseMember}
      hasShowAccess={false}
      onChangeType={noop}
      onChangeStatus={noop}
      onRemove={noop}
      onToggleShowAccess={noop}
    />
  );
}

const openMenu = async (user: ReturnType<typeof renderMenu>['user']) => {
  await user.click(screen.getByRole('button', { name: /actions for ada lovelace/i }));
};

describe('MemberActionMenu', () => {
  it('is a disclosure of buttons, not a fake ARIA menu', async () => {
    const { user } = renderMenu();
    // The trigger must not claim a menu popup it does not implement keyboard for.
    expect(
      screen.getByRole('button', { name: /actions for ada lovelace/i })
    ).not.toHaveAttribute('aria-haspopup');

    await openMenu(user);

    // Action rows are plain buttons — no menu/menuitem roles, because the
    // roving-focus keyboard contract (Arrow/Home/End) is not implemented here.
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0);
  });

  it('gives every action row the 44px touch-target floor', async () => {
    const { user } = renderMenu();
    await openMenu(user);

    // Remove (destructive) and Grant Show Access cover two row variants; all
    // rows share MENU_ITEM_BASE, so min-h-11 on these proves the shared floor.
    expect(screen.getByRole('button', { name: /remove member/i })).toHaveClass('min-h-11');
    expect(screen.getByRole('button', { name: /grant show access/i })).toHaveClass('min-h-11');
  });
});
