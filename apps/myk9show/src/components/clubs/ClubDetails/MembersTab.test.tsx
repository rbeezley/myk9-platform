import { describe, expect, it } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen } from '@/test/utils/testUtils';
import type { Club } from '@/types/club-types';
import type { ClubMember } from '@/types/club-membership-types';
import { MembersTab } from './MembersTab';

const club = {
  id: 'club-1',
  name: 'Heartland Scent Work Club',
} as Club;

const activeMembers: ClubMember[] = [
  {
    id: 'member-1',
    clubId: club.id,
    personId: 'person-1',
    membershipType: 'full',
    membershipStatus: 'active',
    joinedDate: '2026-01-01',
    duesPaidThrough: null,
    votingEligible: true,
    notes: null,
    personName: 'Ada Lovelace',
    personEmail: 'ada@example.com',
  },
];

const renderMembersTab = (overrides: Partial<ComponentProps<typeof MembersTab>> = {}) =>
  render(
    <MembersTab
      club={club}
      members={activeMembers}
      isLoading={false}
      isRefreshing={false}
      isError={false}
      onRetry={() => undefined}
      canManageMembers={false}
      onAddMember={() => undefined}
      {...overrides}
    />
  );

describe('MembersTab', () => {
  it('renders the active records supplied by the canonical membership projection', () => {
    renderMembersTab();

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.queryByText('No Members Yet')).not.toBeInTheDocument();
  });

  it('keeps loading state distinct from an empty roster', () => {
    renderMembersTab({ isLoading: true, members: [] });

    expect(screen.getByRole('status', { name: 'Loading club members' })).toBeInTheDocument();
    expect(screen.queryByText('No Members Yet')).not.toBeInTheDocument();
  });

  it('shows a retryable error state when the canonical roster cannot load', () => {
    renderMembersTab({ isError: true, members: [], onRetry: () => undefined });

    expect(screen.getByText("We couldn't load club members")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('keeps the current roster visible while a refresh is in flight', () => {
    renderMembersTab({ isRefreshing: true });

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Updating members' })).toBeInTheDocument();
  });
});
