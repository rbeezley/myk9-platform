import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { SlideOverPanel } from '../SlideOverPanel';
import { selectReservedBottom, useActionBarStore } from '@/store/actionBarStore';

const reservedBottom = () => selectReservedBottom(useActionBarStore.getState());

describe('SlideOverPanel responsive sizing', () => {
  it.each([
    ['sm', 'md:max-w-md'],
    ['md', 'md:max-w-lg'],
    ['lg', 'md:max-w-2xl'],
    ['xl', 'md:max-w-4xl'],
  ] as const)('keeps the %s width from tablet through desktop breakpoints', (size, expected) => {
    render(
      <SlideOverPanel open onClose={vi.fn()} title={`${size} panel`} size={size}>
        <p>Body</p>
      </SlideOverPanel>
    );

    const panel = screen.getByRole('dialog').querySelector('.slide-over-panel');
    const responsiveMaxWidths = [...(panel?.classList ?? [])].filter(className =>
      /^(sm|md|lg|xl):max-w-/.test(className)
    );

    expect(responsiveMaxWidths.sort()).toEqual(['sm:max-w-none', expected].sort());
  });
});

describe('SlideOverPanel action-bar registration', () => {
  it('reserves the footer height while the panel is open and releases it on close', () => {
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 64,
      height: 64,
      left: 0,
      right: 320,
      top: 0,
      width: 320,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    const { rerender } = render(
      <SlideOverPanel open onClose={vi.fn()} title="Panel" footer={<button>Save</button>}>
        Content
      </SlideOverPanel>
    );

    expect(reservedBottom()).toBe(64);

    rerender(
      <SlideOverPanel open={false} onClose={vi.fn()} title="Panel" footer={<button>Save</button>}>
        Content
      </SlideOverPanel>
    );

    expect(reservedBottom()).toBe(0);
    rectSpy.mockRestore();
  });
});

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

  it('keeps body scroll locked while a stacked panel closes, and unlocks only once none remain open', () => {
    // Regression guard: closing the nested (topmost) panel must not reset
    // `document.body.style.overflow` to 'unset' while the outer panel is
    // still open — scroll should stay locked until the whole stack empties.
    const onClose1 = vi.fn();
    const onClose2 = vi.fn();
    render(<TwoPanels onClose1={onClose1} onClose2={onClose2} />);

    expect(document.body.style.overflow).toBe('hidden');

    // Close the topmost (second) panel — the first is still open.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose2).toHaveBeenCalledTimes(1);
    expect(document.body.style.overflow).toBe('hidden');

    // Close the remaining (first) panel — scroll unlocks now that the stack
    // is empty.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose1).toHaveBeenCalledTimes(1);
    expect(document.body.style.overflow).toBe('unset');
  });
});

describe('SlideOverPanel focus return', () => {
  function TriggerAndPanel({ remountOnToggle = false }: { remountOnToggle?: boolean }) {
    const [open, setOpen] = useState(false);
    const panel = (
      <SlideOverPanel open={open} onClose={() => setOpen(false)} title="Add dog">
        <p>Body</p>
      </SlideOverPanel>
    );

    return (
      <>
        <button onClick={() => setOpen(true)}>Add Dog</button>
        {/* AddDogPanel keys its subtree on `open`, so the panel instance that
            captured the trigger is gone by the time it closes. */}
        {remountOnToggle ? (
          <React.Fragment key={open ? 'open' : 'closed'}>{panel}</React.Fragment>
        ) : (
          panel
        )}
      </>
    );
  }

  it.each([[false], [true]])(
    'returns focus to the control that opened it (remounting subtree: %s)',
    async (remountOnToggle: boolean) => {
      vi.useFakeTimers();
      try {
        render(<TriggerAndPanel remountOnToggle={remountOnToggle} />);
        const trigger = screen.getByRole('button', { name: 'Add Dog' });
        trigger.focus();
        fireEvent.click(trigger);

        expect(screen.getByRole('dialog')).toBeInTheDocument();
        (document.activeElement as HTMLElement | null)?.blur();
        expect(document.activeElement).toBe(document.body);

        fireEvent.click(screen.getByRole('button', { name: /close panel/i }));
        await vi.advanceTimersByTimeAsync(400);

        expect(document.activeElement).toBe(trigger);
      } finally {
        vi.useRealTimers();
      }
    }
  );

  it('leaves focus alone when the close hands it to something else', async () => {
    vi.useFakeTimers();
    try {
      render(
        <>
          <TriggerAndPanel />
          <button>Elsewhere</button>
        </>
      );
      const trigger = screen.getByRole('button', { name: 'Add Dog' });
      trigger.focus();
      fireEvent.click(trigger);

      const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
      fireEvent.click(screen.getByRole('button', { name: /close panel/i }));
      elsewhere.focus();
      await vi.advanceTimersByTimeAsync(400);

      expect(document.activeElement).toBe(elsewhere);
    } finally {
      vi.useRealTimers();
    }
  });
});
