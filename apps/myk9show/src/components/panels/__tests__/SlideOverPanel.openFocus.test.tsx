/**
 * MYK9-1081: a slide-out opened from a menu item. The item is focused when the
 * panel opens, then the menu unmounts it and hands focus back to its trigger on
 * the page BEHIND the aria-modal panel. That hand-back is not the user choosing
 * to be elsewhere: the panel must still take focus, and on close return it to
 * the trigger rather than the vanished item (which leaves focus on <body>).
 * Focus the user moves INTO the panel, or into a portaled popup, is still left
 * alone (see the portal cases in SlideOverPanel.test.tsx).
 */
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { SlideOverPanel } from '../SlideOverPanel';

/** A menu stand-in: its item opens the panel, then unmounts and refocuses the trigger. */
function MenuOpenedPanel() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setMenuOpen(true)}>Create New</button>
      {menuOpen && (
        <button
          onClick={() => {
            setOpen(true);
            setMenuOpen(false);
            // Base UI Menu restores focus to its trigger as the popup closes.
            setTimeout(() => screen.getByRole('button', { name: 'Create New' }).focus(), 50);
          }}
        >
          Dog Only
        </button>
      )}
      <SlideOverPanel open={open} onClose={() => setOpen(false)} title="Add Dog">
        <input aria-label="Call Name" />
      </SlideOverPanel>
    </>
  );
}

function openFromMenu() {
  render(<MenuOpenedPanel />);
  const trigger = screen.getByRole('button', { name: 'Create New' });
  fireEvent.click(trigger);
  const item = screen.getByRole('button', { name: 'Dog Only' });
  item.focus();
  fireEvent.click(item);
  return { trigger };
}

describe('SlideOverPanel open focus when a menu hands focus back behind it', () => {
  it('still focuses into the panel', () => {
    vi.useFakeTimers();
    try {
      const { trigger } = openFromMenu();
      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(document.activeElement).toBe(trigger);

      act(() => {
        vi.advanceTimersByTime(300);
      });
      const slideOut = screen.getByRole('dialog').querySelector('.slide-over-panel') as HTMLElement;
      expect(slideOut).toContainElement(document.activeElement as HTMLElement);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns focus to the trigger on close, not to <body>', () => {
    vi.useFakeTimers();
    try {
      const { trigger } = openFromMenu();
      act(() => {
        vi.advanceTimersByTime(400);
      });
      fireEvent.click(screen.getByRole('button', { name: /close panel/i }));
      // The close animation, then the tick the focus return waits for.
      act(() => {
        vi.advanceTimersByTime(400);
      });
      act(() => {
        vi.advanceTimersByTime(10);
      });
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(trigger);
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves focus the user moved inside the panel', () => {
    vi.useFakeTimers();
    try {
      openFromMenu();
      act(() => {
        vi.advanceTimersByTime(100);
      });
      const close = screen.getByRole('button', { name: /close panel/i });
      close.focus();
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(document.activeElement).toBe(close);
    } finally {
      vi.useRealTimers();
    }
  });
});
