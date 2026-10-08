import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { buildAppShortcuts } from '@/components/layout/appShortcuts';

function Harness({
  openShortcutsOverlay,
  openCommandPalette = vi.fn(),
  navigate = vi.fn(),
}: {
  openShortcutsOverlay: () => void;
  openCommandPalette?: () => void;
  navigate?: (path: string) => void;
}) {
  useKeyboardShortcuts(
    buildAppShortcuts(
      { openCommandPalette, openShortcutsOverlay, navigate },
      { isOnboardingRoute: false }
    )
  );
  return <input aria-label="Note" />;
}

afterEach(cleanup);

describe('useKeyboardShortcuts printable-key suppression (round-2 regression)', () => {
  it('typing "?" into a focused text input does NOT open the shortcuts overlay', () => {
    const openShortcutsOverlay = vi.fn();
    const { getByLabelText } = render(<Harness openShortcutsOverlay={openShortcutsOverlay} />);

    const input = getByLabelText('Note');
    input.focus();
    fireEvent.keyDown(input, { key: '?' });

    expect(openShortcutsOverlay).not.toHaveBeenCalled();
  });

  it('pressing "?" with no input focused opens the shortcuts overlay', () => {
    const openShortcutsOverlay = vi.fn();
    render(<Harness openShortcutsOverlay={openShortcutsOverlay} />);

    (document.activeElement as HTMLElement | null)?.blur?.();
    fireEvent.keyDown(document.body, { key: '?' });

    expect(openShortcutsOverlay).toHaveBeenCalledTimes(1);
  });

  it('Meta+K (global) still fires while an input is focused', () => {
    const openCommandPalette = vi.fn();
    const { getByLabelText } = render(
      <Harness openShortcutsOverlay={vi.fn()} openCommandPalette={openCommandPalette} />
    );

    const input = getByLabelText('Note');
    input.focus();
    fireEvent.keyDown(input, { key: 'k', metaKey: true });

    expect(openCommandPalette).toHaveBeenCalledTimes(1);
  });
});

describe('useKeyboardShortcuts while a dialog is open', () => {
  // The guard read Radix's `data-state="open"`; Base UI dialogs mark themselves `data-open`, so
  // "G D" navigated away from under an open dialog (found 2026-10-07 on the Entries page).
  it('does not run a printable-key shortcut while an app Dialog is open', async () => {
    const navigate = vi.fn();
    const openShortcutsOverlay = vi.fn();
    render(
      <>
        <Harness openShortcutsOverlay={openShortcutsOverlay} navigate={navigate} />
        <Dialog open>
          <DialogContent>
            <DialogTitle>Edit entry</DialogTitle>
            <button type="button">Save</button>
          </DialogContent>
        </Dialog>
      </>
    );
    const save = await screen.findByRole('button', { name: 'Save' });
    save.focus();

    fireEvent.keyDown(save, { key: 'g' });
    fireEvent.keyDown(save, { key: 'd' });
    fireEvent.keyDown(save, { key: '?' });

    expect(navigate).not.toHaveBeenCalled();
    expect(openShortcutsOverlay).not.toHaveBeenCalled();
  });

  it('runs shortcuts again once the dialog has closed', async () => {
    const navigate = vi.fn();
    const ui = (open: boolean) => (
      <>
        <Harness openShortcutsOverlay={vi.fn()} navigate={navigate} />
        <Dialog open={open}>
          <DialogContent>
            <DialogTitle>Edit entry</DialogTitle>
          </DialogContent>
        </Dialog>
      </>
    );
    const { rerender } = render(ui(true));
    await screen.findByRole('dialog');

    rerender(ui(false));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.keyDown(document.body, { key: 'g' });
    fireEvent.keyDown(document.body, { key: 'd' });

    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('does not run a printable-key shortcut under a hand-rolled modal panel', () => {
    const navigate = vi.fn();
    render(
      <>
        <Harness openShortcutsOverlay={vi.fn()} navigate={navigate} />
        <div role="dialog" aria-modal="true" aria-label="Edit dog">
          <button type="button">Save</button>
        </div>
      </>
    );

    fireEvent.keyDown(screen.getByRole('button', { name: 'Save' }), { key: 'g' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Save' }), { key: 'd' });

    expect(navigate).not.toHaveBeenCalled();
  });

  it('still runs Meta+K (global) while a dialog is open', async () => {
    const openCommandPalette = vi.fn();
    render(
      <>
        <Harness openShortcutsOverlay={vi.fn()} openCommandPalette={openCommandPalette} />
        <Dialog open>
          <DialogContent>
            <DialogTitle>Edit entry</DialogTitle>
          </DialogContent>
        </Dialog>
      </>
    );
    await screen.findByRole('dialog');

    fireEvent.keyDown(document.body, { key: 'k', metaKey: true });

    expect(openCommandPalette).toHaveBeenCalledTimes(1);
  });
});
