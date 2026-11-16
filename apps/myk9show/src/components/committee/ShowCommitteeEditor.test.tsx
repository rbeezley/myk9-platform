/**
 * MYK9-2064: a secretary changes the Event Committee for one show without changing the club's
 * list. The service is a small in-memory backend that applies the REAL fallback rule of
 * get_show_committee: the show's own rows when it has any, else the club's list.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/utils/testUtils';
import { ShowCommitteeEditor } from './ShowCommitteeEditor';

const backend = vi.hoisted(() => ({
  club: [] as string[],
  own: [] as Array<{ id: string; personId: null; name: string; sortOrder: number }>,
  readFails: false,
}));

vi.mock('@/services/database/club-memberships/committee', () => ({
  getCommittee: vi.fn(() => Promise.resolve(backend.own.map(m => ({ ...m })))),
  // The RPC rule: own rows replace the club's; null is a failed read.
  fetchShowCommittee: vi.fn(() =>
    Promise.resolve(
      backend.readFails
        ? null
        : backend.own.length > 0
          ? backend.own.map(m => m.name)
          : backend.club
    )
  ),
  copyClubCommitteeToShow: vi.fn(() => {
    backend.own = backend.club.map((name, i) => ({
      id: `s-${i}`,
      personId: null,
      name,
      sortOrder: i,
    }));
    return Promise.resolve();
  }),
  clearShowCommittee: vi.fn(() => {
    backend.own = [];
    return Promise.resolve();
  }),
  addCommitteeMember: vi.fn(),
  removeCommitteeMember: vi.fn((_scope: unknown, id: string) => {
    backend.own = backend.own.filter(m => m.id !== id);
    return Promise.resolve();
  }),
  moveCommitteeMember: vi.fn(),
}));

vi.mock('@/lib/notifications', () => ({ notifications: { success: vi.fn(), error: vi.fn() } }));

describe('ShowCommitteeEditor (MYK9-2064)', () => {
  beforeEach(() => {
    backend.club = [];
    backend.own = [];
    backend.readFails = false;
  });

  it("shows the club's committee until changed, then the show's own list", async () => {
    const user = userEvent.setup();
    backend.club = ['Pat Chair', 'Sam Typed'];
    render(<ShowCommitteeEditor showId="show-1" people={[]} />);

    expect(await screen.findByText('Pat Chair')).toBeInTheDocument();
    expect(screen.getByText(/prints the club.s committee/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Change for this show' }));

    expect(await screen.findByText(/has its own committee/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Use the club's committee" })).toBeInTheDocument();
  });

  it("returns to the club view, saying the club's committee prints, when the last own row is removed", async () => {
    const user = userEvent.setup();
    backend.club = ['Pat Chair', 'Sam Typed'];
    backend.own = [{ id: 's-1', personId: null, name: 'Olive', sortOrder: 0 }];
    render(<ShowCommitteeEditor showId="show-1" people={[]} />);

    await user.click(await screen.findByRole('button', { name: 'Remove Olive' }));

    expect(await screen.findByText(/prints the club.s committee/i)).toBeInTheDocument();
    expect(screen.queryByText(/has its own committee/i)).toBeNull();
    expect(screen.queryByText(/prints no committee/i)).toBeNull();
    expect(await screen.findByText('Pat Chair')).toBeInTheDocument();
  });

  it('drops the own list on "Use the club\'s committee"', async () => {
    const user = userEvent.setup();
    backend.club = ['Pat Chair'];
    backend.own = [{ id: 's-1', personId: null, name: 'Olive', sortOrder: 0 }];
    render(<ShowCommitteeEditor showId="show-1" people={[]} />);

    await user.click(await screen.findByRole('button', { name: "Use the club's committee" }));

    expect(await screen.findByText('Pat Chair')).toBeInTheDocument();
    expect(backend.own).toEqual([]);
  });

  it('says the club lists none only for a real empty list, and offers adding instead of copying', async () => {
    render(<ShowCommitteeEditor showId="show-1" people={[]} />);

    expect(await screen.findByText('The club lists no committee yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change for this show' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add committee member' })).toBeInTheDocument();
  });

  it('shows a loading state, not "none", while the read is in flight', async () => {
    render(<ShowCommitteeEditor showId="show-1" people={[]} />);

    expect(screen.queryByText('The club lists no committee yet.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change for this show' })).toBeNull();
    await screen.findByText('The club lists no committee yet.');
  });

  it('says a failed read is not "none", hides Change, and recovers on retry', async () => {
    const user = userEvent.setup();
    backend.readFails = true;
    backend.club = ['Pat Chair'];
    render(<ShowCommitteeEditor showId="show-1" people={[]} />);

    expect(await screen.findByText(/couldn.t load the club.s committee/i)).toBeInTheDocument();
    expect(screen.queryByText('The club lists no committee yet.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change for this show' })).toBeNull();

    backend.readFails = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Pat Chair')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change for this show' })).toBeInTheDocument();
  });
});
