import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, userEvent } from '@/test/utils/testUtils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './alert-dialog';

/**
 * AlertDialogAction is a Close, so its click fires the caller's handler and
 * dismisses the dialog. When the handler is async the popup stays mounted
 * until it resolves, so a second tap in that window must not re-fire an
 * irreversible action. The guard lives here in the primitive so every
 * AlertDialogAction call site inherits it without opting in.
 */
describe('AlertDialogAction double-submit guard', () => {
  function Harness({ onConfirm }: { onConfirm: () => void }) {
    // open stays true after the action fires — models an async handler that
    // has not yet closed the dialog when the user taps again.
    const [open, setOpen] = useState(true);
    return (
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  it('fires onClick once when the action is pressed twice before unmount', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);

    const action = screen.getByRole('button', { name: /delete/i });
    await user.click(action);
    await user.click(action);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('allows a fresh confirm after the dialog is reopened', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    function ReopenHarness() {
      const [open, setOpen] = useState(false);
      return (
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger>Open</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete</AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction onClick={onConfirm}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      );
    }

    render(<ReopenHarness />);

    await user.click(screen.getByRole('button', { name: /open/i }));
    await user.click(screen.getByRole('button', { name: /delete/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    // Reopen — the popup unmounted on close, so the latch reset with it.
    await user.click(screen.getByRole('button', { name: /open/i }));
    await user.click(screen.getByRole('button', { name: /delete/i }));
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });
});
