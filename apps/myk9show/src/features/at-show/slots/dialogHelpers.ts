/**
 * Shared helper for the at-show dialog slot shims.
 */

/**
 * Bridge a controlled `isOpen`/`onClose` slot onto the Dialog's
 * `open`/`onOpenChange` API: only fire `onClose` on a close transition.
 */
export function handleOpenChange(open: boolean, onClose: () => void): void {
  if (!open) {
    onClose();
  }
}
