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
