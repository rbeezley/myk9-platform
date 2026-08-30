import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Entry } from '../../../stores/entryStore';

export interface ResetMenuPopupProps {
  /** The entry ID that the menu is open for (null if closed) */
  activeEntryId: string | null;
  /** Menu position */
  position: { top: number; left: number } | null;
  /** All entries to find the active one */
  entries: Entry[];
  /** Handler for reset score action */
  onResetScore: (entry: Entry) => void;
  /** Handler for closing the menu */
  onClose: () => void;
}

/**
 * Reset menu popup that appears when clicking the 3-dot menu on scored entries.
 * Uses portal to render at document body level to avoid CSS transform issues.
 * Used by both entry-list modes (single class and combined A/B).
 *
 * Its `reset-menu` / `reset-menu-content` / `reset-option` classes were authored
 * against `ringside.css`, which #436 deleted without migrating this component —
 * so they matched no CSS anywhere and this rendered as an INVISIBLE overlay,
 * still positioned `fixed` at `zIndex: 10000` over the list. It also had no menu
 * semantics, no focus move, and dismissed only on `mousedown`, so a touch or
 * keyboard user could not close it at all.
 */
export const ResetMenuPopup: React.FC<ResetMenuPopupProps> = ({
  activeEntryId,
  position,
  entries,
  onResetScore,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on an outside interaction. `pointerdown` (not `mousedown`) so a touch
  // on a phone — the primary device here — dismisses it too.
  useEffect(() => {
    const handlePointerDown = (e: Event) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-reset-menu]') && !target.closest('.reset-menu-button')) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (activeEntryId !== null) {
      document.addEventListener('pointerdown', handlePointerDown);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('pointerdown', handlePointerDown);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
    return undefined;
  }, [activeEntryId, onClose]);

  // Focus the single action so the menu is reachable without a mouse.
  useEffect(() => {
    if (activeEntryId !== null) {
      menuRef.current?.querySelector('button')?.focus();
    }
  }, [activeEntryId]);

  if (activeEntryId === null || !position) {
    return null;
  }

  const entry = entries.find(e => e.id === activeEntryId);
  if (!entry) {
    return null;
  }

  return createPortal(
    <div
      ref={menuRef}
      data-reset-menu=""
      role="menu"
      aria-label={`Score options for ${entry.callName}`}
      className="fixed z-[10000] min-w-44 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        transform: 'translateX(-100%)', // Extend menu LEFT from anchor point
      }}
    >
      <button
        type="button"
        role="menuitem"
        className="flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium text-foreground hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        onClick={() => onResetScore(entry)}
      >
        <span aria-hidden="true">🔄</span>
        Reset score
      </button>
    </div>,
    document.body
  );
};

export default ResetMenuPopup;
