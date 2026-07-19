import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
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
