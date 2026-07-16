import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent } from '@/test/utils/testUtils';
import { DeleteEntryDialog } from './DeleteEntryDialog';

/**
 * Reproduction: is the destructive confirm action double-submittable?
 *
 * The parent (ClassDetailsPage) handles onConfirm with an async
 * `await deleteEntry(...)`. AlertDialogAction is a Radix Close, so a click
 * fires onConfirm AND begins dismissing the dialog. The question this test
 * answers with evidence: within the window before the dialog unmounts, does a
 * second click re-fire onConfirm?
 */
describe('DeleteEntryDialog double-submit', () => {
  const baseProps = {
    open: true,
    onOpenChange: vi.fn(),
    entryId: 'entry-1',
    rawEntries: [
      {
        id: 'entry-1',
        dogId: 'dog-1',
        registrationData: { handler: 'Jane', armband: '42' },
        competitionData: {},
      },
    ],
    dogs: [{ id: 'dog-1', name: 'Rex', callName: 'Rex' }],
  };

  it('fires onConfirm exactly once when Delete is pressed twice before unmount', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    // Dialog stays mounted (open stays true) — models the async gap where the
    // parent's `await deleteEntry` has not yet closed the dialog.
    render(<DeleteEntryDialog {...baseProps} onConfirm={onConfirm} />);

    const deleteButton = screen.getByRole('button', { name: /delete/i });
    await user.click(deleteButton);
    await user.click(deleteButton);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('allows a fresh confirm after the dialog is reopened', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    const { rerender } = render(
      <DeleteEntryDialog {...baseProps} open={true} onConfirm={onConfirm} />
    );
    await user.click(screen.getByRole('button', { name: /delete/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    // Close, then reopen for a new deletion — the latch must reset.
    rerender(<DeleteEntryDialog {...baseProps} open={false} onConfirm={onConfirm} />);
    rerender(<DeleteEntryDialog {...baseProps} open={true} onConfirm={onConfirm} />);

    await user.click(screen.getByRole('button', { name: /delete/i }));
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });
});
