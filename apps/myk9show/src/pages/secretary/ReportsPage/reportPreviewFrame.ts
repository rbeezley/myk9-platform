/**
 * Ownership of the report preview `<iframe>`.
 *
 * Two renderers share one frame. Reports with `buildPdf` (Check-in Sheet,
 * Scoresheet) point `iframe.src` at a PDF blob; every other report writes HTML
 * through `contentDocument`. While a PDF is loaded the frame belongs to the PDF
 * viewer, so `contentDocument` is not writable — a markup report would silently
 * no-op and leave the PREVIOUS report on screen. `handlePrint` prints this same
 * frame, so that meant printing the wrong document with nothing to warn you.
 *
 * These helpers make the handoff explicit and testable.
 */

/** True when the frame is currently showing a PDF blob rather than our markup. */
export function isDisplayingPdf(iframe: Pick<HTMLIFrameElement, 'getAttribute'>): boolean {
  return iframe.getAttribute('src')?.startsWith('blob:') ?? false;
}

/**
 * Stop displaying a PDF blob so the frame can host markup again. No-op when the
 * frame is not showing one, so it is safe to call on every render.
 */
export function releasePdfFrame(iframe: HTMLIFrameElement): void {
  if (isDisplayingPdf(iframe)) {
    iframe.src = 'about:blank';
  }
}

/**
 * Write `html` into the frame, first reclaiming it from the PDF viewer if
 * needed. Returns a cleanup function for the caller's effect.
 */
export function writeMarkupIntoFrame(
  iframe: HTMLIFrameElement,
  html: string,
  onWritten: () => void
): () => void {
  let timerId: ReturnType<typeof setTimeout> | undefined;

  const write = () => {
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
    timerId = setTimeout(onWritten, 100);
  };

  if (isDisplayingPdf(iframe)) {
    // Writing now would hit the PDF viewer's document. Wait for about:blank.
    iframe.addEventListener('load', write, { once: true });
    iframe.src = 'about:blank';
  } else {
    write();
  }

  return () => {
    iframe.removeEventListener('load', write);
    if (timerId !== undefined) clearTimeout(timerId);
  };
}
