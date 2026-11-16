/**
 * MYK9-2064: the club admin enters the Event Committee once on the club: a person on myK9Show
 * or a typed name, in an order they can change.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/utils/testUtils';
import type { User } from '@/types/user-types';
import { ClubCommitteeSection } from './ClubCommitteeSection';

const { getCommittee, addCommitteeMember, removeCommitteeMember, moveCommitteeMember } = vi.hoisted(
  () => ({
    getCommittee: vi.fn(),
    addCommitteeMember: vi.fn(),
    removeCommitteeMember: vi.fn(),
    moveCommitteeMember: vi.fn(),
  })
);

vi.mock('@/services/database/club-memberships/committee', () => ({
  getCommittee,
  addCommitteeMember,
  removeCommitteeMember,
  moveCommitteeMember,
}));

vi.mock('@/lib/notifications', () => ({ notifications: { success: vi.fn(), error: vi.fn() } }));

const PEOPLE: User[] = [{ id: 'p-1', firstName: 'Linda', lastName: 'Linked' } as User];

const CLUB_LIST = [
  { id: 'm-1', personId: null, name: 'Pat Chair', sortOrder: 0 },
  { id: 'm-2', personId: 'p-1', name: 'Linda Linked', sortOrder: 1 },
];

describe('ClubCommitteeSection (MYK9-2064)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCommittee.mockResolvedValue(CLUB_LIST);
    addCommitteeMember.mockResolvedValue(undefined);
    removeCommitteeMember.mockResolvedValue(undefined);
    moveCommitteeMember.mockResolvedValue(undefined);
  });

  it('lists the committee in order and says what it is for', async () => {
    render(<ClubCommitteeSection clubId="club-1" people={PEOPLE} />);

    expect(await screen.findByText('Pat Chair')).toBeInTheDocument();
    expect(screen.getByText('Linda Linked')).toBeInTheDocument();
    expect(screen.getByText(/at least five names, including the Chair/i)).toBeInTheDocument();
    expect(getCommittee).toHaveBeenCalledWith({ kind: 'club', clubId: 'club-1' });
  });

  it('adds a typed name at the end of the list', async () => {
    const user = userEvent.setup();
    render(<ClubCommitteeSection clubId="club-1" people={PEOPLE} />);

    await user.click(await screen.findByRole('button', { name: 'Add committee member' }));
    await user.type(screen.getByLabelText('Not on myK9Show? Type their name'), '  Sam Typed ');
    await user.click(screen.getByRole('button', { name: 'Add member' }));

    expect(addCommitteeMember).toHaveBeenCalledWith(
      { kind: 'club', clubId: 'club-1' },
      { displayName: 'Sam Typed' },
      2
    );
  });

  it('adds a person on myK9Show picked from the search', async () => {
    const user = userEvent.setup();
    render(<ClubCommitteeSection clubId="club-1" people={PEOPLE} />);

    await user.click(await screen.findByRole('button', { name: 'Add committee member' }));
    await user.type(screen.getByLabelText('Person'), 'lin');
    await user.click(await screen.findByRole('button', { name: /Linda Linked/ }));
    await user.click(screen.getByRole('button', { name: 'Add member' }));

    expect(addCommitteeMember).toHaveBeenCalledWith(
      { kind: 'club', clubId: 'club-1' },
      { personId: 'p-1' },
      2
    );
  });

  it('moves and removes a member', async () => {
    const user = userEvent.setup();
    render(<ClubCommitteeSection clubId="club-1" people={PEOPLE} />);

    await user.click(await screen.findByRole('button', { name: 'Move Linda Linked up' }));
    expect(moveCommitteeMember).toHaveBeenCalledWith(
      { kind: 'club', clubId: 'club-1' },
      CLUB_LIST,
      'm-2',
      'up'
    );

    await user.click(screen.getByRole('button', { name: 'Remove Pat Chair' }));
    expect(removeCommitteeMember).toHaveBeenCalledWith({ kind: 'club', clubId: 'club-1' }, 'm-1');
  });

  it('says a failed load is not the same as no committee, and offers a retry', async () => {
    getCommittee.mockRejectedValueOnce(new Error('offline'));
    render(<ClubCommitteeSection clubId="club-1" people={PEOPLE} />);

    expect(await screen.findByText(/couldn.t load the committee/i)).toBeInTheDocument();
    expect(screen.queryByText('No committee members yet.')).toBeNull();
  });
});
