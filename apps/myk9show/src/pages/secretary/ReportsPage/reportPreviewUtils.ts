import type React from 'react';

/**
 * Triggers the browser print dialog for the contents of the given iframe.
 * Returns false when there is nothing to print yet (the preview has not
 * rendered), so the caller can give the secretary calm feedback instead of a
 * silent no-op on tapping Print.
 */
export function printIframe(iframeRef: React.RefObject<HTMLIFrameElement | null>): boolean {
  const iframe = iframeRef.current;
  if (!iframe) return false;
  // The PDF-backed reports (check-in sheet, scoresheet) point the iframe at a
  // `blob:` object URL instead of writing markup into `contentDocument` — the
  // browser's native PDF viewer owns that document, so `body.innerHTML` is
  // not a meaningful "has content" signal for it.
  const hasPdfContent = iframe.src?.startsWith('blob:') ?? false;
  const hasMarkupContent = Boolean(iframe.contentDocument?.body?.innerHTML);
  if (!hasPdfContent && !hasMarkupContent) return false;
  iframe.contentWindow?.print();
  return true;
}

/** A print() call that takes this long blocked on the dialog, so its return means it closed. */
const BLOCKING_PRINT_MS = 250;

/**
 * Opens the browser print dialog for the iframe and resolves `true` once it has CLOSED, or
 * `false` right away when there is nothing to print yet.
 *
 * `afterprint` on an iframe is unreliable outside Chrome, so the dialog counts as closed on
 * whichever comes first: `afterprint` (on the frame or the window), `print()` returning after it
 * blocked on the dialog (Chrome and Safari), or the window regaining focus. Resolving is
 * idempotent, so a caller records once. None of these tells printed from cancelled, so a caller
 * that records "printed" must keep that record visible and one click to undo.
 */
export async function printIframeAndWait(
  iframeRef: React.RefObject<HTMLIFrameElement | null>
): Promise<boolean> {
  const frameWindow = iframeRef.current?.contentWindow;
  if (!frameWindow) return false;
  return new Promise<boolean>(resolve => {
    let settled = false;
    const finish = (printed: boolean) => {
      if (settled) return;
      settled = true;
      frameWindow.removeEventListener('afterprint', onClosed);
      window.removeEventListener('afterprint', onClosed);
      window.removeEventListener('focus', onClosed);
      resolve(printed);
    };
    const onClosed = () => finish(true);
    frameWindow.addEventListener('afterprint', onClosed);
    window.addEventListener('afterprint', onClosed);
    window.addEventListener('focus', onClosed);
    const startedAt = performance.now();
    if (!printIframe(iframeRef)) {
      finish(false);
      return;
    }
    if (performance.now() - startedAt >= BLOCKING_PRINT_MS) finish(true);
  });
}
