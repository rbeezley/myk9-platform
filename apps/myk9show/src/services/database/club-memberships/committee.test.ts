import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));

vi.mock('../supabaseClient', () => ({ supabase: { from, rpc } }));

import {
  addCommitteeMember,
  clearShowCommittee,
  copyClubCommitteeToShow,
  fetchShowCommittee,
  getCommittee,
  moveCommitteeMember,
} from './committee';

const CLUB = { kind: 'club', clubId: 'club-1' } as const;
const SHOW = { kind: 'show', showId: 'show-1' } as const;

describe('Event Committee service (MYK9-2064)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts a typed name into the club list with a null person_id and the trimmed name', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ insert });

    await addCommitteeMember(CLUB, { displayName: '  Sam Typed ' }, 3);

    expect(from).toHaveBeenCalledWith('club_committee_members');
    expect(insert).toHaveBeenCalledWith({
      club_id: 'club-1',
      person_id: null,
      display_name: 'Sam Typed',
      sort_order: 3,
    });
  });

  it('inserts a person with an account into the show list with no display_name', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ insert });

    await addCommitteeMember(SHOW, { personId: 'p-1' }, 0);

    expect(from).toHaveBeenCalledWith('show_committee_members');
    expect(insert).toHaveBeenCalledWith({
      show_id: 'show-1',
      person_id: 'p-1',
      display_name: null,
      sort_order: 0,
    });
  });

  it('reads a linked person by name and a typed member by display_name, in order', async () => {
    const order2 = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'm-1',
          person_id: 'p-1',
          display_name: null,
          sort_order: 0,
          people: { first_name: 'Ada', last_name: 'Lovelace' },
        },
        { id: 'm-2', person_id: null, display_name: 'Sam Typed', sort_order: 1, people: null },
      ],
      error: null,
    });
    const order1 = vi.fn().mockReturnValue({ order: order2 });
    const eq = vi.fn().mockReturnValue({ order: order1 });
    from.mockReturnValue({ select: () => ({ eq }) });

    const members = await getCommittee(SHOW);

    expect(eq).toHaveBeenCalledWith('show_id', 'show-1');
    expect(members.map(m => m.name)).toEqual(['Ada Lovelace', 'Sam Typed']);
    expect(members.map(m => m.personId)).toEqual(['p-1', null]);
  });

  it('moves a member down by renumbering the list and writing only the rows that changed', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    from.mockReturnValue({ update });
    const members = [
      { id: 'a', personId: null, name: 'A', sortOrder: 5 },
      { id: 'b', personId: null, name: 'B', sortOrder: 5 },
      { id: 'c', personId: null, name: 'C', sortOrder: 9 },
    ];

    await moveCommitteeMember(CLUB, members, 'a', 'down');

    // Order becomes b, a, c at 0, 1, 2. c was 9, so it is renumbered too; every row changed.
    expect(update).toHaveBeenCalledWith({ sort_order: 0 });
    expect(update).toHaveBeenCalledWith({ sort_order: 1 });
    expect(update).toHaveBeenCalledWith({ sort_order: 2 });
    expect(eq).toHaveBeenCalledWith('id', 'b');
    expect(eq).toHaveBeenCalledWith('id', 'a');
    expect(eq).toHaveBeenCalledWith('id', 'c');
  });

  it('does nothing moving the first member up', async () => {
    const members = [{ id: 'a', personId: null, name: 'A', sortOrder: 0 }];
    await moveCommitteeMember(CLUB, members, 'a', 'up');
    expect(from).not.toHaveBeenCalled();
  });

  it('copies the club list into the show as typed names, once each, in order', async () => {
    rpc.mockResolvedValueOnce({
      data: [{ name: 'Pat Chair' }, { name: 'sam typed' }, { name: 'Sam Typed' }],
      error: null,
    });
    const insert = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ insert });

    await copyClubCommitteeToShow('show-1');

    expect(rpc).toHaveBeenCalledWith('get_show_committee', { p_show_id: 'show-1' });
    expect(from).toHaveBeenCalledWith('show_committee_members');
    expect(insert).toHaveBeenCalledWith([
      { show_id: 'show-1', person_id: null, display_name: 'Pat Chair', sort_order: 0 },
      { show_id: 'show-1', person_id: null, display_name: 'sam typed', sort_order: 1 },
    ]);
  });

  it('refuses to copy when the club list could not be read', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(copyClubCommitteeToShow('show-1')).rejects.toThrow();
    expect(from).not.toHaveBeenCalled();
  });

  it("clears only this show's own list", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ delete: () => ({ eq }) });

    await clearShowCommittee('show-1');

    expect(from).toHaveBeenCalledWith('show_committee_members');
    expect(eq).toHaveBeenCalledWith('show_id', 'show-1');
  });

  it('reads a show committee through get_show_committee, null on failure', async () => {
    rpc.mockResolvedValueOnce({ data: [{ name: 'Pat Chair', sort_order: 0 }], error: null });
    expect(await fetchShowCommittee('show-1')).toEqual(['Pat Chair']);
    expect(rpc).toHaveBeenCalledWith('get_show_committee', { p_show_id: 'show-1' });

    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    expect(await fetchShowCommittee('show-1')).toBeNull();
  });
});
