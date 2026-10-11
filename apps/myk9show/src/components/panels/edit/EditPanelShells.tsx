import type { ReactNode, Ref } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/** The `dialog` variant's container: title, scrolling body, footer bar. */
export function EditPanelDialogShell({
  open,
  onRequestClose,
  title,
  body,
  footer,
  actionBarRef,
  deleteDialog,
}: {
  open: boolean;
  /** Fires when the dialog asks to close (Escape, backdrop, X). */
  onRequestClose: () => void;
  title: string;
  body: ReactNode;
  footer: ReactNode;
  actionBarRef: Ref<HTMLDivElement>;
  /** Mounted INSIDE the dialog so Base UI treats it as nested. */
  deleteDialog: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen: boolean) => {
        if (!isOpen) onRequestClose();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">{body}</div>
        <div ref={actionBarRef} className="border-t px-6 py-4 shrink-0">
          {footer}
        </div>
        {deleteDialog}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The `inline` variant's container (MYK9-1089): no panel or dialog of its own.
 * The host slide-out's body scrolls, so the footer sticks to the bottom of that
 * scroller instead of owning a fixed bar.
 */
export function EditPanelInlineShell({
  body,
  footer,
  actionBarRef,
}: {
  body: ReactNode;
  footer: ReactNode;
  actionBarRef: Ref<HTMLDivElement>;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1">{body}</div>
      <div ref={actionBarRef} className="sticky bottom-0 shrink-0 border-t bg-card px-6 py-4">
        {footer}
      </div>
    </div>
  );
}
