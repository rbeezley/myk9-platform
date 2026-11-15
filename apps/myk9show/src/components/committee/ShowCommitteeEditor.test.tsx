/**
 * MYK9-2064: a secretary changes the Event Committee for one show without changing the club's
 * list. The show's own rows replace the club's for that show; "Use the club's committee" drops them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/utils/testUtils';
import { ShowCommitteeEditor } from './ShowCommitteeEditor';

const {
  getCommittee,
  fetchShowCommittee,
  copyClubCommitteeToShow,
  clearShowCommittee,
  addCommitteeMember,
} = vi.hoisted(() => ({
  getCommittee: vi.fn(),
  fetchShowCommittee: vi.fn(),
  copyClubCommitteeToShow: vi.fn(),
  clearShowCommittee: vi.fn(),
  addCommitteeMember: vi.fn(),
}));

vi.mock('@/services/database/club-memberships/committee', () => ({
  getCommittee,
  fetchShowCommittee,
  copyClubCommitteeToShow,
  clearShowCommittee,
  addCommitteeMember,
  removeCommitteeMember: vi.fn(),
  moveCommitteeMember: vi.fn(),
}));

vi.mock('@/lib/notifications', () => ({ notifications: { success: vi.fn(), error: vi.fn() } }));

describe('ShowCommitteeEditor (MYK9-2064)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    copyClubCommitteeToShow.mockResolvedValue(undefined);
    clearShowCommittee.mockResolvedValue(undefined);
    addCommitteeMember.mockResolvedValue(undefined);
  });

  it("shows the club's committee when the show has none of its own, and copies it on request", async () => {
    const user = userEvent.setup();
    getCommittee.mockResolvedValue([]);
    fetchShowCommittee.mockResolvedValue(['Pat Chair', 'Sam Typed']);
    render(<ShowCommitteeEditor showId="show-1" people={[]} />);

    expect(await screen.findByText('Pat Chair')).toBeInTheDocument();
    expect(screen.getByText(/prints the club.s committee/i)).toBeInTheDocument();

    getCommittee.mockResolvedValue([
      { id: 's-1', personId: null, name: 'Pat Chair', sortOrder: 0 },
      { id: 's-2', personId: null, name: 'Sam Typed', sortOrder: 1 },
    ]);
    await user.click(screen.getByRole('button', { name: 'Change for this show' }));

    expect(copyClubCommitteeToShow).toHaveBeenCalledWith('show-1');
    expect(await screen.findByText(/has its own committee/i)).toBeInTheDocument();
    expect(getCommittee).toHaveBeenCalledWith({ kind: 'show', showId: 'show-1' });
  });

  it("adds to the show's own list, not the club's", async () => {
    const user = userEvent.setup();
    getCommittee.mockResolvedValue([{ id: 's-1', personId: null, name: 'Olive', sortOrder: 0 }]);
    fetchShowCommittee.mockResolvedValue(['Olive']);
    render(<ShowCommitteeEditor showId="show-1" people={[]} />);

    await user.click(await screen.findByRole('button', { name: 'Add committee member' }));
    await user.type(screen.getByLabelText('Not on myK9Show? Type their name'), 'Gus Guest');
    await user.click(screen.getByRole('button', { name: 'Add member' }));

    expect(addCommitteeMember).toHaveBeenCalledWith(
      { kind: 'show', showId: 'show-1' },
      { displayName: 'Gus Guest' },
      1
    );
  });

  it('drops the show\'s own list on "Use the club\'s committee"', async () => {
    const user = userEvent.setup();
    getCommittee.mockResolvedValue([{ id: 's-1', personId: null, name: 'Olive', sortOrder: 0 }]);
    fetchShowCommittee.mockResolvedValue(['Olive']);
    render(<ShowCommitteeEditor showId="show-1" people={[]} />);

    await user.click(await screen.findByRole('button', { name: "Use the club's committee" }));

    expect(clearShowCommittee).toHaveBeenCalledWith('show-1');
  });

  it('says the club lists no committee when neither list has a name', async () => {
    getCommittee.mockResolvedValue([]);
    fetchShowCommittee.mockResolvedValue([]);
    render(<ShowCommitteeEditor showId="show-1" people={[]} />);

    expect(await screen.findByText('The club lists no committee yet.')).toBeInTheDocument();
  });
});
