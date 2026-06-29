import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { MembersTable, OfficersTable } from './ClubMemberTables';
import { TYPE_BADGE_CLASSES, STATUS_BADGE_CLASSES } from './ClubMemberDialogs';
import type { ClubMember, ClubOfficer } from '@/types/club-membership-types';

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

const baseOfficer: ClubOfficer = {
  id: 'o1',
  clubId: 'c1',
  personId: 'p2',
  personName: 'Grace Hopper',
  personEmail: 'grace@example.com',
  position: 'president',
} as ClubOfficer;

const noop = () => {};

describe('MembersTable', () => {
  it('renders a member row with name and email', () => {
    render(
      <MembersTable
        members={[baseMember]}
        showManagerIds={new Set()}
        searchQuery=""
        onAddMember={noop}
        onChangeType={noop}
        onChangeStatus={noop}
        onRemove={noop}
        onToggleShowAccess={noop}
      />
    );
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
  });

  it('shows the Show Manager badge when the member has show access', () => {
    render(
      <MembersTable
        members={[baseMember]}
        showManagerIds={new Set(['p1'])}
        searchQuery=""
        onAddMember={noop}
        onChangeType={noop}
        onChangeStatus={noop}
        onRemove={noop}
        onToggleShowAccess={noop}
      />
    );
    expect(screen.getByText('Show Manager')).toBeInTheDocument();
  });

  it('renders the empty state with an Add Member CTA when there are no members', () => {
    render(
      <MembersTable
        members={[]}
        showManagerIds={new Set()}
        searchQuery=""
        onAddMember={noop}
        onChangeType={noop}
        onChangeStatus={noop}
        onRemove={noop}
        onToggleShowAccess={noop}
      />
    );
    expect(screen.getByText('No Members Yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add member/i })).toBeInTheDocument();
  });

  it('renders the search-empty state without the Add Member CTA', () => {
    render(
      <MembersTable
        members={[]}
        showManagerIds={new Set()}
        searchQuery="zzz"
        onAddMember={noop}
        onChangeType={noop}
        onChangeStatus={noop}
        onRemove={noop}
        onToggleShowAccess={noop}
      />
    );
    expect(screen.getByText('No Members Found')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add member/i })).not.toBeInTheDocument();
  });

  it('uses a plain ASCII hyphen (no em dash) for a missing email', () => {
    render(
      <MembersTable
        members={[{ ...baseMember, personEmail: undefined }]}
        showManagerIds={new Set()}
        searchQuery=""
        onAddMember={noop}
        onChangeType={noop}
        onChangeStatus={noop}
        onRemove={noop}
        onToggleShowAccess={noop}
      />
    );
    // ASCII hyphen, never the em dash banned in UI copy.
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });
});

describe('OfficersTable', () => {
  it('renders an officer row and a 44px-floor accessible remove button', () => {
    const onRemoveOfficer = vi.fn();
    render(
      <OfficersTable
        officers={[baseOfficer]}
        onAssignOfficer={noop}
        onRemoveOfficer={onRemoveOfficer}
      />
    );
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    const removeBtn = screen.getByRole('button', {
      name: /remove grace hopper from president/i,
    });
    expect(removeBtn.className).toContain('h-11');
    expect(removeBtn.className).toContain('w-11');
  });

  it('renders the officers empty state with an Assign Officer CTA', () => {
    render(<OfficersTable officers={[]} onAssignOfficer={noop} onRemoveOfficer={noop} />);
    expect(screen.getByText('No Officers Assigned')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /assign officer/i })).toBeInTheDocument();
  });
});

describe('membership badge tokens', () => {
  it('maps every membership type to a semantic token class (no raw palette)', () => {
    Object.values(TYPE_BADGE_CLASSES).forEach(cls => {
      // Must use semantic tokens, never raw Tailwind palette shades.
      expect(cls).not.toMatch(/-(400|500|600|700|800|900|950)\b/);
      expect(cls).toMatch(/(primary|info|warning|success)/);
    });
  });

  it('maps every membership status to a semantic token class', () => {
    Object.values(STATUS_BADGE_CLASSES).forEach(cls => {
      expect(cls).toMatch(/(success|warning|destructive|muted)/);
    });
  });
});
