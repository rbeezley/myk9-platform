/**
 * Minimal modal shell for the ringside EntryList dialogs.
 *
 * These dialogs were authored against `ringside.css`, which #436 deleted when it
 * migrated the EntryList surface to Tailwind — but the two dialog components
 * were never migrated with it. Their class names (`dialog-overlay`,
 * `reset-dialog`, `dialog-button`, …) have had NO matching CSS anywhere in the
 * repo since, so they rendered as unstyled inline blocks at the bottom of the
 * page: no scrim, no centering, no z-index. A judge tapping "reset score" got a
 * confirmation prompt that could be entirely below the fold.
 *
 * They also had no dialog semantics at all — no `role`, no `aria-modal`, no
 * labelling, no focus move, no Escape. This supplies all of that in one place so
 * the two callers only describe their content.
 *
 * Deliberately local to `@myk9/ringside` rather than reusing the host app's
 * dialog primitive: this package must not depend on the host's component
 * library. It stays small on purpose — a scrim, a centred panel, focus in and
 * back, and Escape.
 */
import React, { useCallback, useEffect, useId, useRef } from 'react';

export interface RingsideModalProps {
  /** Accessible name for the dialog. */
  title: string;
  /** Called on Escape, scrim click, or the dialog's own dismiss control. */
  onDismiss: () => void;
  children: React.ReactNode;
  /** Footer actions, rendered right-aligned below the content. */
  footer: React.ReactNode;
}

export const RingsideModal: React.FC<RingsideModalProps> = ({
  title,
  onDismiss,
  children,
  footer,
}) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<Element | null>(null);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onDismiss();
      }
    },
    [onDismiss]
  );

  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    // Move focus INTO the dialog so a keyboard or screen-reader user lands on it
    // rather than continuing to tab through the page behind the scrim.
    panelRef.current?.focus();

    return () => {
      const target = previouslyFocused.current;
      if (target instanceof HTMLElement) target.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      // A scrim click is a dismiss, matching the platform convention. The panel
      // stops propagation so a click inside never closes it.
      onClick={onDismiss}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-sm rounded-xl border border-border bg-card p-5 text-card-foreground shadow-lg focus-visible:outline-none"
        onClick={event => event.stopPropagation()}
      >
        <h2 id={titleId} className="m-0 text-base font-semibold">
          {title}
        </h2>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">{children}</div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div>
      </div>
    </div>
  );
};

/** Shared button styling for the modal footer — 44px floor, real focus ring. */
export const modalButtonClass =
  'inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
