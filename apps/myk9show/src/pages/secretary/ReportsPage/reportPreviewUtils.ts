import type React from 'react';

/**
 * Triggers the browser print dialog for the contents of the given iframe.
 * Returns false when there is nothing to print yet (the preview has not
 * rendered), so the caller can give the secretary calm feedback instead of a
 * silent no-op on tapping Print.
 */
export function printIframe(iframeRef: React.RefObject<HTMLIFrameElement | null>): boolean {
  const iframe = iframeRef.current;
  if (!iframe?.contentDocument?.body?.innerHTML) return false;
  iframe.contentWindow?.print();
  return true;
}
