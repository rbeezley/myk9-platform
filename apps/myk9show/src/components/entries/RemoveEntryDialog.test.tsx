import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent } from '@/test/utils/testUtils';
import { RemoveEntryDialog } from './RemoveEntryDialog';

/**
 * Reproduction: is the destructive confirm action double-submittable?
 *
 * The parent (ClassDetailsPage, EntryListCard) handles onConfirm with an async
 * `await deleteEntry(...)`. AlertDialogAction is a Radix Close, so a click
 * fires onConfirm AND begins dismissing the dialog. The question this test
 * answers with evidence: within the window before the dialog unmounts, does a
 * second click re-fire onConfirm?
 */
describe('RemoveEntryDialog double-submit', () => {
  const baseProps = {
    open: true,
    onOpenChange: vi.fn(),
    dogName: 'Rex',
    className: 'Interior Novice A',
  };

  it('fires onConfirm exactly once when Remove Entry is pressed twice before unmount', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    // Dialog stays mounted (open stays true) — models the async gap where the
    // parent's `await deleteEntry` has not yet closed the dialog.
    render(<RemoveEntryDialog {...baseProps} onConfirm={onConfirm} />);

    const deleteButton = screen.getByRole('button', { name: /remove entry/i });
    await user.click(deleteButton);
    await user.click(deleteButton);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('allows a fresh confirm after the dialog is reopened', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    const { rerender } = render(
      <RemoveEntryDialog {...baseProps} open={true} onConfirm={onConfirm} />
    );
    await user.click(screen.getByRole('button', { name: /remove entry/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    // Close, then reopen for a new deletion — the latch must reset.
    rerender(<RemoveEntryDialog {...baseProps} open={false} onConfirm={onConfirm} />);
    rerender(<RemoveEntryDialog {...baseProps} open={true} onConfirm={onConfirm} />);

    await user.click(screen.getByRole('button', { name: /remove entry/i }));
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });
});
