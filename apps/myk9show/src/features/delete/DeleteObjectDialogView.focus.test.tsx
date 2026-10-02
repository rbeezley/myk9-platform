/**
 * MYK9-922 round 9: every delete confirm must contain focus, make the page
 * behind it inert, and hand focus back to what opened it. The old class-page
 * Remove entry and trial Delete class used the AlertDialog primitive; the shared
 * view is built on it too, so none of those three properties is hand-rolled.
 */
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { DeleteObjectDialogView } from './DeleteObjectDialogView';

const target = { id: 'c1', name: 'Novice A', detail: 'Container, Novice A' };

function Harness({ onCancel = vi.fn() }: { onCancel?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open delete
      </button>
      <button type="button">Behind the dialog</button>
      <DeleteObjectDialogView
        open={open}
        onCancel={() => {
          onCancel();
          setOpen(false);
        }}
        onConfirm={vi.fn()}
        kind="class"
        targets={[target]}
        previewState={{
          status: 'ready',
          preview: {
            trials: 0,
            classes: 0,
            entries: 0,
            shows: 0,
            dogs: 0,
            paid: 0,
            scored: 0,
            blocking: 0,
          },
        }}
      />
    </>
  );
}

describe('DeleteObjectDialogView focus handling', () => {
  it('Tab cycles inside the dialog and never reaches the page behind it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open delete' }));
    const dialog = await screen.findByRole('alertdialog');

    // Base UI parks focus on a hidden guard for a beat before wrapping it to the
    // far end of the dialog, so each stop is awaited, not read synchronously.
    const settlesInside = () =>
      waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    const behind = screen.getByRole('button', { name: 'Behind the dialog', hidden: true });
    for (let i = 0; i < 8; i++) {
      await user.tab();
      await settlesInside();
      expect(document.activeElement).not.toBe(behind);
    }
    for (let i = 0; i < 4; i++) {
      await user.tab({ shift: true });
      await settlesInside();
      expect(document.activeElement).not.toBe(behind);
    }
  });

  it('makes the page behind the dialog inert to assistive tech', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open delete' }));
    await screen.findByRole('alertdialog');
    expect(screen.queryByRole('button', { name: 'Behind the dialog' })).toBeNull();
  });

  it('returns focus to the trigger when the dialog closes', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<Harness onCancel={onCancel} />);
    const trigger = screen.getByRole('button', { name: 'Open delete' });
    await user.click(trigger);
    await screen.findByRole('alertdialog');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(onCancel).toHaveBeenCalled();
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
