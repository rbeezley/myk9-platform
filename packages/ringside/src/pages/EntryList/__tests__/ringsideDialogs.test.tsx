/**
 * These three components were authored against `ringside.css`, which #436
 * deleted when it migrated the EntryList surface to Tailwind — without
 * migrating them. Their class names (`dialog-overlay`, `reset-dialog`,
 * `reset-menu`, …) matched no CSS anywhere in the repo afterwards, so:
 *
 *  - the reset confirmation and the self-check-in explanation rendered as
 *    unstyled inline blocks with no scrim, no centring and no z-index, possibly
 *    below the fold, while the page behind them stayed fully interactive;
 *  - the reset menu rendered INVISIBLE while still sitting `fixed` at
 *    z-index 10000 over the list, and dismissed only on `mousedown` — so a
 *    touch or keyboard user could not close it at all.
 *
 * None of them had dialog or menu semantics. These pin the semantics rather
 * than the styling: asserting class strings is what let the original rot go
 * unnoticed, since a class name proves nothing about whether CSS exists.
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ResetConfirmDialog } from '../components/ResetConfirmDialog';
import { SelfCheckinDisabledDialog } from '../components/SelfCheckinDisabledDialog';
import { ResetMenuPopup } from '../components/ResetMenuPopup';
import type { Entry } from '../../../stores/entryStore';

const ENTRY = { id: 'entry-1', callName: 'Rex', armband: 42 } as unknown as Entry;

describe('ResetConfirmDialog', () => {
  it('is a labelled modal dialog, not an anonymous block', () => {
    render(<ResetConfirmDialog isOpen entry={ENTRY} onConfirm={vi.fn()} onCancel={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    // Named from its own heading, so screen readers announce what it is.
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /reset score/i })).not.toBeNull();
  });

  it('names the dog whose score is about to be destroyed', () => {
    render(<ResetConfirmDialog isOpen entry={ENTRY} onConfirm={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText(/Rex \(42\)/)).not.toBeNull();
  });

  it('cancels on Escape', () => {
    const onCancel = vi.fn();
    render(<ResetConfirmDialog isOpen entry={ENTRY} onConfirm={vi.fn()} onCancel={onCancel} />);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <ResetConfirmDialog isOpen={false} entry={ENTRY} onConfirm={vi.fn()} onCancel={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('SelfCheckinDisabledDialog', () => {
  it('is a labelled modal dialog', () => {
    render(<SelfCheckinDisabledDialog isOpen onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<SelfCheckinDisabledDialog isOpen onClose={onClose} />);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('ResetMenuPopup', () => {
  const open = (onClose = vi.fn(), onResetScore = vi.fn()) =>
    render(
      <ResetMenuPopup
        activeEntryId="entry-1"
        position={{ top: 10, left: 10 }}
        entries={[ENTRY]}
        onResetScore={onResetScore}
        onClose={onClose}
      />
    );

  it('exposes menu semantics and names the dog', () => {
    open();

    const menu = screen.getByRole('menu');
    expect(menu.getAttribute('aria-label')).toContain('Rex');
    expect(screen.getByRole('menuitem', { name: /reset score/i })).not.toBeNull();
  });

  it('closes on Escape, which it previously could not do at all', () => {
    const onClose = vi.fn();
    open(onClose);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on an outside pointerdown, so touch can dismiss it', () => {
    // Dismissal used to be `mousedown`-only — on a phone, the primary device
    // for this surface, the menu could not be dismissed.
    const onClose = vi.fn();
    open(onClose);

    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalled();
  });
});
