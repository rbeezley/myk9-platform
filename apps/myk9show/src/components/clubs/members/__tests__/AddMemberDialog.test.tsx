import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, userEvent, waitFor } from '@/test/utils/testUtils';
import type { Club } from '@/types/club-types';
import { useUserStore } from '@/store/userStore';
import { AddMemberDialog } from '../AddMemberDialog';

vi.mock('@/services/database/club-memberships', () => ({ addClubMember: vi.fn() }));

const club = { id: 'k1', name: 'Heartland KC' } as unknown as Club;

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open add member</button>
      <AddMemberDialog open={open} onOpenChange={setOpen} club={club} members={[]} />
    </>
  );
}

describe('AddMemberDialog', () => {
  it('is a modal dialog (one decision), not a slide-out, and Escape closes it', async () => {
    useUserStore.setState({
      people: [{ id: 1, firstName: 'Ada', lastName: 'Lovelace', email: 'a@b.c' }],
    } as never);
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open add member' });
    await user.click(opener);

    const dialog = await screen.findByRole('dialog');
    expect(dialog.className).toMatch(/left-\[50%\]/); // centered Dialog, not an edge-anchored sheet
    expect(dialog.className).toMatch(/max-w-md/);
    expect(dialog).toHaveTextContent('Add Member to Heartland KC');
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
