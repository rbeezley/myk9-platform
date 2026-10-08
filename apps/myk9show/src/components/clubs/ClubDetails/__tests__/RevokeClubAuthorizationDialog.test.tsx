import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@/test/utils/testUtils';
import { RevokeClubAuthorizationDialog } from '../RevokeClubAuthorizationDialog';

function Harness({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <RevokeClubAuthorizationDialog
      open={open}
      onOpenChange={setOpen}
      clubName="Heartland Club"
      onConfirm={onConfirm}
    />
  );
}

describe('RevokeClubAuthorizationDialog (P3-C)', () => {
  it('says what revoking does, then revokes on confirm and closes', async () => {
    const onConfirm = vi.fn();
    const { user } = render(<Harness onConfirm={onConfirm} />);

    const dialog = await screen.findByRole('alertdialog');
    // MYK9-572 round 4 (P2-3): the copy describes what actually happens (stops NEW
    // publishes; already-published shows stay visible).
    expect(
      within(dialog).getByText(/stop heartland club from publishing new shows/i)
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/stays visible wherever it already has a published show/i)
    ).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Revoke Authorization' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('does not revoke when cancelled', async () => {
    const onConfirm = vi.fn();
    const { user } = render(<Harness onConfirm={onConfirm} />);

    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
