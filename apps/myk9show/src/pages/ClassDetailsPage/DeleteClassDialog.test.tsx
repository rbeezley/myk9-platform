import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { DeleteClassDialog } from './DeleteClassDialog';

// The dialog owns the confirm contract for every caller: it stays open and says why when the
// delete rejects, closes only after it resolves, and is not dismissed by the action itself.

function Harness({ onConfirm }: { onConfirm: () => Promise<void> }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <span data-testid="open-state">{String(open)}</span>
      <DeleteClassDialog
        open={open}
        onOpenChange={setOpen}
        currentClass={{ element: 'Containers', level: 'Novice', section: 'A' }}
        onConfirm={onConfirm}
      />
    </>
  );
}

describe('DeleteClassDialog confirm contract', () => {
  it('stays open and shows the reason when the delete rejects', async () => {
    const onConfirm = vi
      .fn()
      .mockRejectedValue(new Error("Can't delete this class: needs a connection."));
    const { user } = render(<Harness onConfirm={onConfirm} />);

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/needs a connection/i);
    expect(screen.getByRole('alertdialog')).toBeVisible();
    expect(screen.getByTestId('open-state')).toHaveTextContent('true');
    // Retry is possible: the action is enabled again.
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
  });

  it('closes only after the delete resolves, and is pending meanwhile', async () => {
    let resolveDelete: () => void = () => undefined;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>(resolve => {
          resolveDelete = resolve;
        })
    );
    const { user } = render(<Harness onConfirm={onConfirm} />);

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('button', { name: 'Deleting...' })).toBeDisabled();
    expect(screen.getByTestId('open-state')).toHaveTextContent('true');

    resolveDelete();
    await waitFor(() => expect(screen.getByTestId('open-state')).toHaveTextContent('false'));
  });
});
