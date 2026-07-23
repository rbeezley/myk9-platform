import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { SlideOverPanel } from '../SlideOverPanel';

describe('SlideOverPanel side support', () => {
  it('defaults to a right-side panel', () => {
    render(
      <SlideOverPanel open onClose={vi.fn()} title="Panel">
        <p>Body</p>
      </SlideOverPanel>
    );

    const panel = screen.getByRole('dialog').querySelector('.slide-over-panel');
    expect(panel).toHaveClass('right-0');
    expect(panel).toHaveClass('rounded-l-xl');
  });

  it('can render as a left-side panel', () => {
    render(
      <SlideOverPanel open onClose={vi.fn()} title="Message Center" side="left">
        <p>Body</p>
      </SlideOverPanel>
    );

    const panel = screen.getByRole('dialog').querySelector('.slide-over-panel');
    expect(panel).toHaveClass('left-0');
    expect(panel).toHaveClass('rounded-r-xl');
  });
});

describe('SlideOverPanel stacked Escape handling', () => {
  // Two independent open SlideOverPanels (e.g. the Add-a-Dog wizard with a
  // nested registration slide-over above it). Each instance registers its own
  // document `keydown` listener, so without topmost-only gating a single
  // Escape press would close both at once.
  function TwoPanels({ onClose1, onClose2 }: { onClose1: () => void; onClose2: () => void }) {
    const [open1, setOpen1] = useState(true);
    const [open2, setOpen2] = useState(true);
    return (
      <>
        <SlideOverPanel
          open={open1}
          onClose={() => {
            onClose1();
            setOpen1(false);
          }}
          title="First panel"
        >
          <p>First body</p>
        </SlideOverPanel>
        <SlideOverPanel
          open={open2}
          onClose={() => {
            onClose2();
            setOpen2(false);
          }}
          title="Second panel"
        >
          <p>Second body</p>
        </SlideOverPanel>
      </>
    );
  }

  it('Escape closes only the topmost panel, then falls through to the next one', () => {
    const onClose1 = vi.fn();
    const onClose2 = vi.fn();
    render(<TwoPanels onClose1={onClose1} onClose2={onClose2} />);

    // First Escape: only the second (topmost, last-opened) panel closes.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose2).toHaveBeenCalledTimes(1);
    expect(onClose1).not.toHaveBeenCalled();

    // Second Escape: with the second panel closed, the first is now topmost.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose1).toHaveBeenCalledTimes(1);
    expect(onClose2).toHaveBeenCalledTimes(1);
  });

  it('a new onClose identity on the bottom panel does not steal Escape from the panel above it', () => {
    // Regression guard: stack registration must depend ONLY on `open`, not on
    // `onClose`/`preventClose`. An inline onClose prop gets a new identity on
    // every parent render; if that re-pushed the panel's id, the bottom panel
    // would jump above the panel that opened later and steal its Escape.
    const onClose1 = vi.fn();
    const onClose2 = vi.fn();
    const { rerender } = render(<TwoPanels onClose1={onClose1} onClose2={onClose2} />);

    const onClose1Again = vi.fn();
    rerender(<TwoPanels onClose1={onClose1Again} onClose2={onClose2} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose2).toHaveBeenCalledTimes(1);
    expect(onClose1).not.toHaveBeenCalled();
    expect(onClose1Again).not.toHaveBeenCalled();
  });
});
