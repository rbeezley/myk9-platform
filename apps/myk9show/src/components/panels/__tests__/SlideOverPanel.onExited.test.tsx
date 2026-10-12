/**
 * MYK9-1081: `onExited` lets a caller open the next slide-out only once this
 * one has left the screen (DSE's Add Person Only, then Add Dog), so two are
 * never shown at once.
 */
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { SlideOverPanel } from '../SlideOverPanel';

function Harness({ onExited, initiallyOpen }: { onExited: () => void; initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <SlideOverPanel
        open={open}
        onClose={() => setOpen(false)}
        title="Add Person"
        onExited={onExited}
      >
        <p>Body</p>
      </SlideOverPanel>
    </>
  );
}

describe('SlideOverPanel onExited', () => {
  it('fires once, after the panel has left the DOM and focus is back on its opener', async () => {
    const trigger = () => screen.getByRole('button', { name: 'Open' });
    // What a caller opening the next panel from here would see.
    const seen: Array<{ dialogs: number; focusOnOpener: boolean }> = [];
    const onExited = vi.fn(() => {
      seen.push({
        dialogs: document.querySelectorAll('[role="dialog"]').length,
        focusOnOpener: document.activeElement === trigger(),
      });
    });
    render(<Harness onExited={onExited} initiallyOpen={false} />);
    trigger().focus();
    fireEvent.click(trigger());
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // A real close leaves focus on the control clicked inside the panel.
    const close = screen.getByRole('button', { name: /close panel/i });
    close.focus();
    fireEvent.click(close);
    // Still on screen while it slides out.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onExited).not.toHaveBeenCalled();

    await waitFor(() => expect(onExited).toHaveBeenCalledTimes(1), { timeout: 2000 });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(onExited).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([{ dialogs: 0, focusOnOpener: true }]);
  });

  it('does not fire for a panel that was never opened', async () => {
    const onExited = vi.fn();
    render(<Harness onExited={onExited} initiallyOpen={false} />);
    await new Promise(resolve => setTimeout(resolve, 400));
    expect(onExited).not.toHaveBeenCalled();
  });
});
